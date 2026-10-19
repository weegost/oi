import copy
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import agent, allocation, demo_full, llm, rag
from ..allocation import Mode
from ..db import get_db
from ..demo import DEMO_FLOW, DEMO_MESSAGES, DEMO_PROJECT
from ..flow import Flow, find_gaps
from ..models import Company, FlowVersion, Project

router = APIRouter(prefix="/api/projects", tags=["projects"])


class ProjectCreate(BaseModel):
    tax_id: str
    name: str
    work: str = ""
    problem: str = ""
    scope: str = ""


class AllocationUpdate(BaseModel):
    mode: Mode


class ChatRequest(BaseModel):
    mode: Literal["direct", "guided"]
    message: str = ""  # AI 引導模式可留空，請 Agent 主動提問


def _out(p: Project, company: Company) -> dict:
    flow = Flow.model_validate(p.flow)
    return {
        "id": p.id,
        "tax_id": p.tax_id,
        "company_name": company.name,
        "industry": company.industry,
        "name": p.name,
        "work": p.work,
        "problem": p.problem,
        "scope": p.scope,
        "flow": flow.model_dump(),
        "gaps": find_gaps(flow),
        "messages": p.messages,
        # 流程中已刪除的節點不再回傳其分工
        "allocations": {k: v for k, v in (p.allocations or {}).items() if any(n.id == k for n in flow.nodes)},
    }


def _load(db: Session, project_id: int) -> tuple[Project, Company]:
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "找不到這個專案。")
    return p, db.get(Company, p.tax_id)


def _save_flow(db: Session, p: Project, flow: dict, source: str):
    p.flow = flow
    db.add(FlowVersion(project_id=p.id, source=source, flow=flow))


@router.post("")
def create_project(body: ProjectCreate, db: Session = Depends(get_db)):
    company = db.get(Company, body.tax_id)
    if not company:
        raise HTTPException(400, "請先查詢統一編號，建立企業背景。")
    p = Project(**body.model_dump(), flow={"nodes": [], "edges": []}, messages=[])
    db.add(p)
    db.commit()
    return _out(p, company)


@router.post("/demo")
def create_demo_project(full: bool = False, db: Session = Depends(get_db)):
    """建立「小名 3C 網店」示範專案（企業資料需先以 00000000 查詢建立）。
    full=true 時載入四個階段都已完成的完整示範，使用預存的 AI 分析，不需等待 AI。"""
    company = db.get(Company, "00000000")
    if not company:
        raise HTTPException(400, "請先以案例代碼 00000000 載入示範企業。")
    if full:
        p = demo_full.create(db)
        db.commit()
        return _out(p, company)
    demo_full.seed_documents(db)
    p = Project(tax_id="00000000", **DEMO_PROJECT, flow={}, messages=copy.deepcopy(DEMO_MESSAGES))
    db.add(p)
    db.flush()
    _save_flow(db, p, copy.deepcopy(DEMO_FLOW), "demo")
    db.commit()
    return _out(p, company)


@router.get("/{project_id}")
def get_project(project_id: int, db: Session = Depends(get_db)):
    return _out(*_load(db, project_id))


@router.put("/{project_id}/flow")
def save_flow(project_id: int, flow: Flow, db: Session = Depends(get_db)):
    """企業在流程圖上手動編輯（拖曳、修改、確認節點）後儲存。"""
    p, company = _load(db, project_id)
    _save_flow(db, p, flow.model_dump(), "manual")
    db.commit()
    return _out(p, company)


@router.post("/{project_id}/chat")
def chat(project_id: int, body: ChatRequest, db: Session = Depends(get_db)):
    p, company = _load(db, project_id)
    if body.mode == "direct" and not body.message.strip():
        raise HTTPException(400, "請輸入工作描述。")

    context = {
        "company": company.name,
        "industry": company.industry.get("label", ""),
        "work": p.work,
        "problem": p.problem,
        "scope": p.scope,
    }
    try:
        result = agent.run(
            body.mode, context, p.flow, p.messages, body.message, retriever=lambda q: rag.search(db, p.tax_id, q)
        )
    except llm.LLMNotConfigured as e:
        raise HTTPException(503, str(e))
    except Exception as e:  # 模型忙碌或輸出格式錯誤：流程不變，請企業重試
        raise HTTPException(502, f"AI 暫時無法回應，流程未變更，請稍後再試。（{type(e).__name__}）")

    messages = list(p.messages)
    if body.message.strip():
        messages.append({"role": "user", "mode": body.mode, "text": body.message.strip()})
    messages.append(
        {"role": "assistant", "mode": body.mode, "text": result["reply"], "sources": result.get("docs", [])}
    )
    p.messages = messages
    if result["flow"] != p.flow:
        _save_flow(db, p, result["flow"], "agent")
    db.commit()
    return _out(p, company)


@router.get("/{project_id}/versions")
def list_versions(project_id: int, db: Session = Depends(get_db)):
    _load(db, project_id)
    rows = db.scalars(
        select(FlowVersion).where(FlowVersion.project_id == project_id).order_by(FlowVersion.id.desc())
    )
    return [
        {"id": v.id, "source": v.source, "nodes": len(v.flow.get("nodes", [])), "created_at": v.created_at}
        for v in rows
    ]


def _task_node(p: Project, node_id: str):
    flow = Flow.model_validate(p.flow)
    node = next((n for n in flow.nodes if n.id == node_id), None)
    if not node or node.kind in ("start", "end"):
        raise HTTPException(404, "找不到這個工作步驟。")
    return flow, node


@router.post("/{project_id}/nodes/{node_id}/explore")
def explore_node(project_id: int, node_id: str, db: Session = Depends(get_db)):
    """請 AI 探索這一步可以怎麼介入，並比較四種人機分工。"""
    p, company = _load(db, project_id)
    flow, node = _task_node(p, node_id)
    context = {
        "company": company.name,
        "industry": company.industry.get("label", ""),
        "work": p.work,
        "problem": p.problem,
    }
    # 示範案例的步驟若與預存時相同，直接使用預存分析，報告現場不用等 AI
    baked = demo_full.baked_exploration(node.id, node.title) if p.tax_id == demo_full.DEMO_TAX_ID else None
    try:
        if baked:
            exp = allocation.Exploration.model_validate(baked)
            sources = demo_full.baked_sources(node.id, node.title)
        else:
            # 依這一步的內容檢索企業文件，讓分析符合企業自己的規定
            sources = rag.search(db, p.tax_id, allocation.node_query(node))
            exp = allocation.explore(context, flow, node, sources)
    except llm.LLMNotConfigured as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        raise HTTPException(502, f"AI 暫時無法回應，請稍後再試。（{type(e).__name__}）")

    current = (p.allocations or {}).get(node_id, {})
    p.allocations = {
        **(p.allocations or {}),
        node_id: {
            "mode": current.get("mode", "human"),
            "exploration": exp.model_dump(),
            "sources": sources,
            "node_title": node.title,
        },
    }
    db.commit()
    return _out(p, company)


@router.put("/{project_id}/allocations/{node_id}")
def set_allocation(project_id: int, node_id: str, body: AllocationUpdate, db: Session = Depends(get_db)):
    """企業選定這一步要採用的分工方式。"""
    p, company = _load(db, project_id)
    _, node = _task_node(p, node_id)
    current = (p.allocations or {}).get(node_id, {})
    p.allocations = {**(p.allocations or {}), node_id: {**current, "mode": body.mode, "node_title": node.title}}
    db.commit()
    return _out(p, company)
