from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


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


def empty_flow() -> dict:
    return {"nodes": [], "edges": []}


class Project(Base):
    """一個改善專案：企業想改善的一項工作，以及它的現況流程與 Agent 對話。"""

    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tax_id: Mapped[str] = mapped_column(ForeignKey("companies.tax_id"))
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
