"""帳號與登入：一家公司共用一個帳號，登入後建立的專案會保留，之後可在「我的專案」重新查看。

- 密碼以 scrypt（Python 內建）加鹽雜湊後儲存，不存明碼。
- 登入狀態放在 httpOnly cookie，前端 JavaScript 讀不到；下載 Word 等直接連結也會自動帶上。
- 不登入也能使用系統，只是專案不屬於任何帳號，不會出現在專案列表。
"""

import hashlib
import hmac
import re
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import get_db
from .models import Account, AuthToken, Project

COOKIE = "bizpilot_session"
COOKIE_MAX_AGE = 60 * 60 * 24 * 30  # 30 天內不用重新登入
USERNAME_RE = re.compile(r"[A-Za-z0-9_.@-]{3,50}")


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"{salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    salt_hex, digest_hex = stored.split("$", 1)
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex), n=2**14, r=8, p=1)
    return hmac.compare_digest(digest.hex(), digest_hex)


def optional_account(request: Request, db: Session = Depends(get_db)) -> Account | None:
    """目前登入的帳號；沒登入回傳 None。"""
    token = request.cookies.get(COOKIE)
    if not token:
        return None
    row = db.get(AuthToken, token)
    return db.get(Account, row.account_id) if row else None


def check_project_access(request: Request, db: Session = Depends(get_db)):
    """網址中有 project_id 時：屬於某帳號的專案只有該帳號能看，其他人一律當作不存在。"""
    project_id = request.path_params.get("project_id")
    if project_id is None:
        return
    p = db.get(Project, int(project_id))
    if not p or p.account_id is None:
        return  # 找不到交給各端點回 404；未登入建立的專案不設限
    account = optional_account(request, db)
    if not account or account.id != p.account_id:
        raise HTTPException(404, "找不到這個專案。")


def _out(a: Account) -> dict:
    return {"id": a.id, "username": a.username, "display_name": a.display_name}


def _login(response: Response, db: Session, account: Account) -> dict:
    token = secrets.token_hex(32)
    db.add(AuthToken(token=token, account_id=account.id))
    db.commit()
    response.set_cookie(COOKIE, token, max_age=COOKIE_MAX_AGE, httponly=True, samesite="lax")
    return _out(account)


router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    username: str
    password: str
    display_name: str = ""


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/register")
def register(body: RegisterRequest, response: Response, db: Session = Depends(get_db)):
    username = body.username.strip()
    if not USERNAME_RE.fullmatch(username):
        raise HTTPException(400, "帳號請用 3–50 個英文字母、數字或 _ . @ -。")
    if len(body.password) < 6:
        raise HTTPException(400, "密碼至少 6 個字。")
    if db.scalar(select(Account.id).where(Account.username == username)):
        raise HTTPException(400, "這個帳號已經有人使用，請換一個。")
    account = Account(
        username=username, password_hash=hash_password(body.password), display_name=body.display_name.strip()
    )
    db.add(account)
    db.flush()
    return _login(response, db, account)


@router.post("/login")
def login(body: LoginRequest, response: Response, db: Session = Depends(get_db)):
    account = db.scalar(select(Account).where(Account.username == body.username.strip()))
    if not account or not verify_password(body.password, account.password_hash):
        raise HTTPException(400, "帳號或密碼不正確。")
    return _login(response, db, account)


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    if token := request.cookies.get(COOKIE):
        if row := db.get(AuthToken, token):
            db.delete(row)
            db.commit()
    response.delete_cookie(COOKIE)
    return {"ok": True}


@router.get("/me")
def me(account: Account | None = Depends(optional_account)):
    """沒登入時回傳 null（不是錯誤），前端據此顯示「登入」按鈕。"""
    return _out(account) if account else None
