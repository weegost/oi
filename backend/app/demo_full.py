"""一鍵載入完整示範：四個階段都已完成的「小名 3C 網店」專案。

AI 分析與摘要事先以 scripts/bake_demo.py 呼叫 Gemini 產生，存在 demo_data/demo_full.json；
載入時不呼叫 AI，報告現場不受網路與模型忙碌影響。情境測試是決定性規則，載入時即時執行。
"""

import copy
import json
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import rag
from .demo import DEMO_FULL_FLOW, DEMO_FULL_MESSAGES, DEMO_FULL_MODES, DEMO_FULL_SANDBOX_CONFIG, DEMO_PROJECT
from .models import Document, FlowVersion, Project
from .sandbox import service

DEMO_TAX_ID = "00000000"
BAKED_PATH = Path(__file__).parent / "demo_data" / "demo_full.json"
DOCS_DIR = Path(__file__).parent / "demo_data" / "docs"
DOC_VECTORS_PATH = Path(__file__).parent / "demo_data" / "demo_docs.json"
DEMO_DOCS = [("退貨政策.md", "政策"), ("客服退貨SOP.md", "SOP"), ("常見問題FAQ.md", "FAQ")]


def seed_documents(db: Session):
    """示範企業還沒有文件時，放入退貨政策、客服 SOP、FAQ。
    向量事先以 scripts/bake_demo.py 產生，載入時不呼叫 Gemini；沒有預存向量才即時向量化。"""
    if db.scalar(select(Document.id).where(Document.tax_id == DEMO_TAX_ID).limit(1)):
        return
    vectors = json.loads(DOC_VECTORS_PATH.read_text(encoding="utf-8")) if DOC_VECTORS_PATH.exists() else {}
    for filename, kind in DEMO_DOCS:
        text = (DOCS_DIR / filename).read_text(encoding="utf-8")
        rag.add_document(db, DEMO_TAX_ID, filename, kind, text, vectors.get(filename))


def load_baked() -> dict:
    """{explorations: {node_id: {node_title, exploration}}, summary, generated_at}；尚未產生時回傳空內容。"""
    if not BAKED_PATH.exists():
        return {"explorations": {}, "summary": None}
    return json.loads(BAKED_PATH.read_text(encoding="utf-8"))


def baked_exploration(node_id: str, node_title: str, baked: dict | None = None) -> dict | None:
    """示範案例的步驟若與預存時相同（id 與名稱都一致），直接回傳預存分析。"""
    hit = (baked or load_baked())["explorations"].get(node_id)
    return hit["exploration"] if hit and hit["node_title"] == node_title else None


def baked_sources(node_id: str, node_title: str, baked: dict | None = None) -> list[dict]:
    """預存分析當時引用的文件段落。"""
    hit = (baked or load_baked())["explorations"].get(node_id)
    return hit.get("sources", []) if hit and hit["node_title"] == node_title else []


def create(db: Session, baked: dict | None = None) -> Project:
    baked = baked or load_baked()
    seed_documents(db)
    flow = copy.deepcopy(DEMO_FULL_FLOW)
    titles = {n["id"]: n["title"] for n in flow["nodes"]}
    allocations = {}
    for node_id, mode in DEMO_FULL_MODES.items():
        allocations[node_id] = {"mode": mode, "node_title": titles[node_id]}
        if exp := baked_exploration(node_id, titles[node_id], baked):
            allocations[node_id]["exploration"] = exp
            allocations[node_id]["sources"] = baked_sources(node_id, titles[node_id], baked)

    p = Project(
        tax_id=DEMO_TAX_ID,
        **DEMO_PROJECT,
        flow=flow,
        messages=copy.deepcopy(DEMO_FULL_MESSAGES),
        allocations=allocations,
        sandbox={},
        report={"summary": baked["summary"], "generated_at": baked.get("generated_at")} if baked.get("summary") else {},
    )
    db.add(p)
    db.flush()
    db.add(FlowVersion(project_id=p.id, source="demo", flow=flow))
    service.run_and_store(p, db, DEMO_FULL_SANDBOX_CONFIG, [])
    return p


def save_baked(explorations: dict, summary: str | None):
    BAKED_PATH.parent.mkdir(exist_ok=True)
    BAKED_PATH.write_text(
        json.dumps(
            {"generated_at": datetime.now(timezone.utc).isoformat(), "explorations": explorations, "summary": summary},
            ensure_ascii=False,
            indent=1,
        ),
        encoding="utf-8",
    )
