"""公司工作區：用統編代表一家公司，管理者邀請同事加入，成員共用這家公司的專案。"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import EMAIL_RE, member_role, optional_account, require_account
from ..db import get_db
from ..models import Account, Company, Project, Workspace, WorkspaceInvitation, WorkspaceMember

router = APIRouter(prefix="/api/workspaces", tags=["workspaces"])

ADMIN, MEMBER = "ADMIN", "MEMBER"


class WorkspaceCreate(BaseModel):
    tax_id: str  # 需先以 /api/companies/{tax_id} 查詢過，公司資料才會存在
    name: str = ""  # 留空用公司名稱
    description: str = ""


class InviteRequest(BaseModel):
    email: str


def _workspace_or_404(db: Session, workspace_id: int) -> Workspace:
    w = db.get(Workspace, workspace_id)
    if not w:
        raise HTTPException(404, "找不到這個工作區。")
    return w


def _require_member(db: Session, workspace_id: int, account: Account) -> str:
    """不是成員一律回 404，不透露這個工作區是否存在。"""
    role = member_role(db, workspace_id, account.id)
    if not role:
        raise HTTPException(404, "找不到這個工作區。")
    return role


def _summary(db: Session, w: Workspace, role: str) -> dict:
    company = db.get(Company, w.tax_id)
    return {
        "id": w.id,
        "name": w.name,
        "tax_id": w.tax_id,
        "company_name": company.name if company else "",
        "description": w.description,
        "role": role,
        "member_count": db.scalar(
            select(func.count()).select_from(WorkspaceMember).where(WorkspaceMember.workspace_id == w.id)
        ),
        "project_count": db.scalar(select(func.count()).select_from(Project).where(Project.workspace_id == w.id)),
    }


@router.get("")
def my_workspaces(account: Account | None = Depends(optional_account), db: Session = Depends(get_db)):
    account = require_account(account)
    rows = db.execute(
        select(Workspace, WorkspaceMember.role)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(WorkspaceMember.account_id == account.id)
        .order_by(Workspace.created_at.desc())
    ).all()
    return [_summary(db, w, role) for w, role in rows]


@router.post("")
def create_workspace(
    body: WorkspaceCreate, account: Account | None = Depends(optional_account), db: Session = Depends(get_db)
):
    account = require_account(account)
    company = db.get(Company, body.tax_id)
    if not company or company.registration_type == "manual":
        raise HTTPException(400, "請先查詢統一編號，建立企業背景。")
    # 一個統編一個工作區（示範公司例外，讓每個人都能練習）；已有的請管理者邀請
    if company.registration_type != "demo" and db.scalar(
        select(Workspace.id).where(Workspace.tax_id == company.tax_id)
    ):
        raise HTTPException(400, "這家公司已經有工作區了，請請管理者用你的 Email 邀請你加入。")
    w = Workspace(
        tax_id=company.tax_id,
        name=body.name.strip() or company.name,
        description=body.description.strip()[:4000],
        created_by=account.id,
    )
    db.add(w)
    db.flush()
    db.add(WorkspaceMember(workspace_id=w.id, account_id=account.id, role=ADMIN))
    db.commit()
    return _summary(db, w, ADMIN)


# 注意：固定路徑的 /invitations/... 要放在 /{workspace_id} 之前，否則會被當成工作區編號
@router.get("/invitations/mine")
def my_invitations(account: Account | None = Depends(optional_account), db: Session = Depends(get_db)):
    """寄給我的 Email、還沒回覆的邀請。"""
    account = require_account(account)
    rows = db.execute(
        select(WorkspaceInvitation, Workspace, Account.display_name)
        .join(Workspace, Workspace.id == WorkspaceInvitation.workspace_id)
        .outerjoin(Account, Account.id == WorkspaceInvitation.invited_by)
        .where(WorkspaceInvitation.email == account.username.lower(), WorkspaceInvitation.status == "PENDING")
        .order_by(WorkspaceInvitation.created_at.desc())
    ).all()
    return [
        {
            "id": inv.id,
            "workspace_id": w.id,
            "workspace_name": w.name,
            "invited_by": inviter or "",
            "created_at": inv.created_at,
        }
        for inv, w, inviter in rows
    ]


def _my_pending_invitation(db: Session, account: Account, invitation_id: int) -> WorkspaceInvitation:
    inv = db.get(WorkspaceInvitation, invitation_id)
    if not inv or inv.status != "PENDING" or inv.email != account.username.lower():
        raise HTTPException(404, "找不到這個邀請，或已經回覆過了。")
    return inv


@router.post("/invitations/{invitation_id}/accept")
def accept_invitation(
    invitation_id: int, account: Account | None = Depends(optional_account), db: Session = Depends(get_db)
):
    account = require_account(account)
    inv = _my_pending_invitation(db, account, invitation_id)
    if not member_role(db, inv.workspace_id, account.id):
        db.add(WorkspaceMember(workspace_id=inv.workspace_id, account_id=account.id, role=MEMBER))
    inv.status = "ACCEPTED"
    inv.responded_at = datetime.now(timezone.utc)
    db.commit()
    return _summary(db, db.get(Workspace, inv.workspace_id), MEMBER)


@router.post("/invitations/{invitation_id}/decline")
def decline_invitation(
    invitation_id: int, account: Account | None = Depends(optional_account), db: Session = Depends(get_db)
):
    account = require_account(account)
    inv = _my_pending_invitation(db, account, invitation_id)
    inv.status = "DECLINED"
    inv.responded_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}


@router.get("/{workspace_id}")
def get_workspace(
    workspace_id: int, account: Account | None = Depends(optional_account), db: Session = Depends(get_db)
):
    account = require_account(account)
    role = _require_member(db, workspace_id, account)
    w = _workspace_or_404(db, workspace_id)
    members = db.execute(
        select(Account, WorkspaceMember.role)
        .join(WorkspaceMember, WorkspaceMember.account_id == Account.id)
        .where(WorkspaceMember.workspace_id == workspace_id)
        .order_by(WorkspaceMember.created_at)
    ).all()
    out = _summary(db, w, role)
    out["members"] = [
        {"account_id": a.id, "display_name": a.display_name, "email": a.username, "role": r} for a, r in members
    ]
    out["invitations"] = []
    if role == ADMIN:  # 只有管理者看得到邀請清單
        invs = db.scalars(
            select(WorkspaceInvitation)
            .where(WorkspaceInvitation.workspace_id == workspace_id, WorkspaceInvitation.status == "PENDING")
            .order_by(WorkspaceInvitation.created_at.desc())
        ).all()
        out["invitations"] = [{"id": i.id, "email": i.email, "created_at": i.created_at} for i in invs]
    return out


@router.post("/{workspace_id}/invitations")
def invite(
    workspace_id: int,
    body: InviteRequest,
    account: Account | None = Depends(optional_account),
    db: Session = Depends(get_db),
):
    account = require_account(account)
    if _require_member(db, workspace_id, account) != ADMIN:
        raise HTTPException(403, "只有管理者可以邀請同事。")
    email = body.email.strip().lower()
    if not EMAIL_RE.fullmatch(email) or len(email) > 200:
        raise HTTPException(400, "請輸入正確的電子郵件。")
    existing = db.scalar(select(Account).where(Account.username == email))
    if existing and member_role(db, workspace_id, existing.id):
        raise HTTPException(400, "這個人已經是工作區成員了。")
    if db.scalar(
        select(WorkspaceInvitation.id).where(
            WorkspaceInvitation.workspace_id == workspace_id,
            WorkspaceInvitation.email == email,
            WorkspaceInvitation.status == "PENDING",
        )
    ):
        raise HTTPException(400, "已經邀請過這個電子郵件了，等對方回覆即可。")
    inv = WorkspaceInvitation(workspace_id=workspace_id, email=email, invited_by=account.id)
    db.add(inv)
    db.commit()
    return {"id": inv.id, "email": inv.email, "created_at": inv.created_at}


@router.delete("/{workspace_id}/invitations/{invitation_id}")
def revoke_invitation(
    workspace_id: int,
    invitation_id: int,
    account: Account | None = Depends(optional_account),
    db: Session = Depends(get_db),
):
    account = require_account(account)
    if _require_member(db, workspace_id, account) != ADMIN:
        raise HTTPException(403, "只有管理者可以取消邀請。")
    inv = db.get(WorkspaceInvitation, invitation_id)
    if not inv or inv.workspace_id != workspace_id or inv.status != "PENDING":
        raise HTTPException(404, "找不到這個邀請。")
    inv.status = "REVOKED"
    inv.responded_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}
