"""帳號與登入：每個人用 Email 註冊個人帳號，再建立或加入公司工作區，專案由工作區成員共用。

- 密碼以 scrypt（Python 內建）加鹽雜湊後儲存，不存明碼。
- 登入狀態放在 httpOnly cookie，前端 JavaScript 讀不到；下載 Word 等直接連結也會自動帶上。
- 不登入也能使用系統，只是專案不屬於任何帳號，不會出現在專案列表。
- 舊版「一家公司共用一個帳號」的帳號仍可用原本的帳號名稱登入。
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
from .models import Account, AuthToken, Project, WorkspaceMember

COOKIE = "bizpilot_session"
COOKIE_MAX_AGE = 60 * 60 * 24 * 30  # 30 天內不用重新登入
EMAIL_RE = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")
MIN_PASSWORD = 8


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


def require_account(account: Account | None) -> Account:
    if not account:
        raise HTTPException(401, "請先登入。")
    return account


def member_role(db: Session, workspace_id: int, account_id: int) -> str | None:
    """帳號在工作區的身分（ADMIN／MEMBER）；不是成員回傳 None。"""
    return db.scalar(
        select(WorkspaceMember.role).where(
            WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.account_id == account_id
        )
    )


def can_access_project(db: Session, account: Account | None, p: Project) -> bool:
    """未登入建立、且不屬於任何工作區的專案不設限；其餘只有建立者與所屬工作區的成員能看。"""
    if p.account_id is None and p.workspace_id is None:
        return True
    if not account:
        return False
    if p.account_id == account.id:
        return True
    return p.workspace_id is not None and member_role(db, p.workspace_id, account.id) is not None


def check_project_access(request: Request, db: Session = Depends(get_db)):
    """網址中有 project_id 時：有主人的專案只有建立者與工作區成員能看，其他人一律當作不存在。"""
    project_id = request.path_params.get("project_id")
    if project_id is None:
        return
    p = db.get(Project, int(project_id))
    if not p:
        return  # 找不到交給各端點回 404
    if not can_access_project(db, optional_account(request, db), p):
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
    email: str
    password: str
    display_name: str = ""


class LoginRequest(BaseModel):
    username: str  # Email；舊版公司帳號則填原本的帳號名稱
    password: str


@router.post("/register")
def register(body: RegisterRequest, response: Response, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    if not EMAIL_RE.fullmatch(email) or len(email) > 200:
        raise HTTPException(400, "請輸入正確的電子郵件。")
    if len(body.password) < MIN_PASSWORD:
        raise HTTPException(400, f"密碼至少 {MIN_PASSWORD} 個字元。")
    if not body.display_name.strip():
        raise HTTPException(400, "請輸入顯示姓名。")
    if db.scalar(select(Account.id).where(Account.username == email)):
        raise HTTPException(400, "這個電子郵件已經註冊過，請直接登入。")
    account = Account(
        username=email, password_hash=hash_password(body.password), display_name=body.display_name.strip()
    )
    db.add(account)
    db.flush()
    return _login(response, db, account)


@router.post("/login")
def login(body: LoginRequest, response: Response, db: Session = Depends(get_db)):
    name = body.username.strip()
    account = db.scalar(select(Account).where(Account.username.in_({name, name.lower()})))
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
