from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base

EMBED_DIM = 768  # gemini-embedding-2 輸出維度（縮成 768，儲存與檢索較快）


class Company(Base):
    """統編查詢結果快取；raw 保留官方原始回應，方便日後補欄位。"""

    __tablename__ = "companies"

    tax_id: Mapped[str] = mapped_column(String(8), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    registration_type: Mapped[str] = mapped_column(String(20))  # company／business／demo
    owner: Mapped[str] = mapped_column(String(100), default="")
    address: Mapped[str] = mapped_column(String(300), default="")
    status: Mapped[str] = mapped_column(String(50), default="")
    capital: Mapped[str] = mapped_column(String(30), default="")
    setup_date: Mapped[str] = mapped_column(String(20), default="")
    business_items: Mapped[list] = mapped_column(JSONB, default=list)
    industry: Mapped[dict] = mapped_column(JSONB, default=dict)
    raw: Mapped[dict] = mapped_column(JSONB, default=dict)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Account(Base):
    """個人登入帳號。新帳號以 Email 當作 username；舊版「一家公司共用一個帳號」的帳號仍可登入。"""

    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(200), unique=True, index=True)  # 新帳號為小寫 Email
    password_hash: Mapped[str] = mapped_column(String(200))  # scrypt，格式：salt$hash（hex）
    display_name: Mapped[str] = mapped_column(String(200), default="")  # 顯示姓名（舊帳號為公司名稱）
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Workspace(Base):
    """公司工作區：以統編代表一家公司，成員共用這家公司的專案。示範公司可以建立多個。"""

    __tablename__ = "workspaces"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tax_id: Mapped[str] = mapped_column(ForeignKey("companies.tax_id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")  # 補充登記資料以外的實際業務
    created_by: Mapped[int | None] = mapped_column(ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class WorkspaceMember(Base):
    """工作區成員；role 為 ADMIN（可邀請同事）或 MEMBER。"""

    __tablename__ = "workspace_members"
    __table_args__ = (UniqueConstraint("workspace_id", "account_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    workspace_id: Mapped[int] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(10), default="MEMBER")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class WorkspaceInvitation(Base):
    """站內邀請：管理者輸入同事的 Email，對方用同一個 Email 登入後在「我的工作區」接受。不會寄出郵件。"""

    __tablename__ = "workspace_invitations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    workspace_id: Mapped[int] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    email: Mapped[str] = mapped_column(String(200), index=True)  # 小寫
    status: Mapped[str] = mapped_column(String(10), default="PENDING")  # PENDING／ACCEPTED／DECLINED／REVOKED
    invited_by: Mapped[int | None] = mapped_column(ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AuthToken(Base):
    """登入狀態：瀏覽器 cookie 裡放的隨機字串，登出即刪除。"""

    __tablename__ = "auth_tokens"

    token: Mapped[str] = mapped_column(String(64), primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


def empty_flow() -> dict:
    return {"nodes": [], "edges": []}


class Project(Base):
    """一個改善專案：企業想改善的一項工作，以及它的現況流程與 Agent 對話。"""

    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tax_id: Mapped[str] = mapped_column(ForeignKey("companies.tax_id"))
    # 登入時建立的專案記下建立者；未登入建立的為 None，不會出現在任何人的專案列表
    account_id: Mapped[int | None] = mapped_column(
        ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # 屬於某個公司工作區的專案，由工作區所有成員共用；沒有工作區的專案只有建立者能看
    workspace_id: Mapped[int | None] = mapped_column(
        ForeignKey("workspaces.id", ondelete="SET NULL"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(200))
    work: Mapped[str] = mapped_column(String(200), default="")  # 想改善的工作
    problem: Mapped[str] = mapped_column(Text, default="")  # 目前問題
    scope: Mapped[str] = mapped_column(Text, default="")  # 分析範圍
    flow: Mapped[dict] = mapped_column(JSONB, default=empty_flow)  # {nodes, edges}
    messages: Mapped[list] = mapped_column(JSONB, default=list)  # [{role, text, mode}]
    # 第二階段人機分工：{node_id: {mode, exploration, node_title}}
    allocations: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    # 第三階段沙盒：{config: {條件: bool}, run: 第幾次, ran_at, scenarios, results, summary}
    sandbox: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    # 第四階段：{summary: AI 撰寫的摘要, generated_at}
    report: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class FlowVersion(Base):
    """每次 Agent 更新或手動儲存都留一份快照，可回溯流程演變。"""

    __tablename__ = "flow_versions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    source: Mapped[str] = mapped_column(String(20))  # agent／manual／demo
    flow: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ---- 企業文件（RAG） ----


class Document(Base):
    """企業上傳的 SOP、FAQ、政策、商品資料；屬於企業，同一企業的各專案共用。"""

    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tax_id: Mapped[str] = mapped_column(ForeignKey("companies.tax_id"), index=True)
    filename: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(20))  # SOP／FAQ／政策／商品資料／其他
    chars: Mapped[int] = mapped_column(Integer)
    embedded: Mapped[bool] = mapped_column(default=False)  # False：向量化失敗，只能用關鍵字檢索
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DocChunk(Base):
    """文件切成的段落與其向量，檢索時依工作節點或對話內容找出最相關的段落。"""

    __tablename__ = "doc_chunks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    tax_id: Mapped[str] = mapped_column(String(8), index=True)
    idx: Mapped[int] = mapped_column(Integer)  # 文件中的第幾段（從 1 起算）
    text: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(EMBED_DIM), nullable=True)


# ---- 政府開放資料 ----


class PenaltyCase(Base):
    """標檢局電子類／電機類處分案件。官方只保留近一個月，定期同步後在此累積。
    刻意不存被處分人、電話、地址等個資欄位，比對只需要商品分類與通路。"""

    __tablename__ = "penalty_cases"

    # 同一處分文號會因多條違反條文重複出現、也可能涵蓋多個商品分類，以 (文號, 分類) 為鍵
    doc_no: Mapped[str] = mapped_column(String(40), primary_key=True)  # 處分文號
    category: Mapped[str] = mapped_column(String(100), primary_key=True, index=True)  # 商品分類
    dataset: Mapped[str] = mapped_column(String(10))  # 電子／電機
    penalty_date: Mapped[str] = mapped_column(String(8))  # YYYYMMDD
    violation: Mapped[str] = mapped_column(Text, default="")  # 違反條文（多條以「；」合併）
    channel: Mapped[str] = mapped_column(String(10), default="")  # 實體／網路
    origin: Mapped[str] = mapped_column(String(10), default="")  # 進口／產製
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ProductRecall(Base):
    """標檢局歷年商品召回訊息（官方資料至民國 105 年）。"""

    __tablename__ = "product_recalls"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(Text)
    published: Mapped[str] = mapped_column(String(20))
    url: Mapped[str] = mapped_column(String(300), default="")


class ComplaintStat(Base):
    """消保會申訴及調解案件分類統計：類別 × 縣市 × 月份。"""

    __tablename__ = "complaint_stats"

    category: Mapped[str] = mapped_column(String(50), primary_key=True)
    region: Mapped[str] = mapped_column(String(10), primary_key=True)
    month: Mapped[str] = mapped_column(String(7), primary_key=True)  # YYYY-MM
    count: Mapped[int] = mapped_column(Integer)


class DataSync(Base):
    """各資料集最近一次同步狀態，顯示在介面上。"""

    __tablename__ = "data_syncs"

    dataset: Mapped[str] = mapped_column(String(40), primary_key=True)
    source: Mapped[str] = mapped_column(String(20))  # live／snapshot
    rows: Mapped[int] = mapped_column(Integer)
    total: Mapped[int] = mapped_column(Integer)  # 累積筆數
    message: Mapped[str] = mapped_column(Text, default="")
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
