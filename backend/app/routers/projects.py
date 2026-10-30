import copy
import secrets
from concurrent.futures import ThreadPoolExecutor
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import agent, allocation, demo_full, llm, rag
from ..auth import check_project_access, member_role, optional_account, require_account
from ..allocation import Mode
from ..db import get_db
from ..demo import DEMO_FLOW, DEMO_MESSAGES, DEMO_PROJECT
from ..flow import Flow, find_gaps
from ..models import Account, Company, FlowVersion, Project, Workspace, WorkspaceMember

# 網址有 project_id 的端點都會檢查：有主人的專案只有建立者與所屬工作區的成員能看
router = APIRouter(prefix="/api/projects", tags=["projects"], dependencies=[Depends(check_project_access)])


class ProjectCreate(BaseModel):
    tax_id: str = ""  # 留空表示不查統編，直接開始
    company_name: str = ""  # 不查統編時由使用者自填，可留空
    name: str
    work: str = ""
    problem: str = ""
    scope: str = ""
    workspace_id: int | None = None  # 指定工作區時，公司固定為工作區的公司，成員共用這個專案


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
        "workspace_id": p.workspace_id,
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


def _manual_company(db: Session, name: str) -> Company:
    """沒有統編的企業：建立一筆自填資料，以 M 開頭的代碼識別（不會和 8 位數字的統編重複）。"""
    while db.get(Company, tax_id := f"M{secrets.randbelow(10**7):07d}"):
        pass
    company = Company(
        tax_id=tax_id,
        name=name.strip() or "我的公司",
        registration_type="manual",
        industry={"label": "", "is_3c": False, "online_retail": False, "matched_items": [], "demo_scenario": None},
    )
    db.add(company)
    db.flush()
    return company


def _workspace_for_new_project(db: Session, account: Account | None, workspace_id: int | None) -> Workspace | None:
    """建立專案時指定工作區：必須登入，而且是該工作區的成員。"""
    if workspace_id is None:
        return None
    account = require_account(account)
    w = db.get(Workspace, workspace_id)
    if not w or not member_role(db, w.id, account.id):
        raise HTTPException(404, "找不到這個工作區。")
    return w


@router.get("")
def list_projects(
    workspace_id: int | None = None,
    account: Account | None = Depends(optional_account),
    db: Session = Depends(get_db),
):
    """「我的專案」：我建立的，加上我所屬工作區的專案，最近更新的在前。workspace_id 可只看某個工作區。"""
    if not account:
        raise HTTPException(401, "請先登入，才能查看之前的專案。")
    my_workspaces = select(WorkspaceMember.workspace_id).where(WorkspaceMember.account_id == account.id)
    query = (
        select(Project, Company, Workspace.name)
        .join(Company, Company.tax_id == Project.tax_id)
        .outerjoin(Workspace, Workspace.id == Project.workspace_id)
        .where((Project.account_id == account.id) | Project.workspace_id.in_(my_workspaces))
        .order_by(Project.updated_at.desc())
    )
    if workspace_id is not None:
        query = query.where(Project.workspace_id == workspace_id)
    out = []
    for p, company, workspace_name in db.execute(query).all():
        tasks = [n for n in (p.flow or {}).get("nodes", []) if n.get("kind") not in ("start", "end")]
        # 做到第幾步：有流程 → 1，有 AI 分析 → 2，跑過模擬 → 3，有 AI 摘要 → 4
        progress = 1 if tasks else 0
        if any(a.get("exploration") for a in (p.allocations or {}).values()):
            progress = 2
        if (p.sandbox or {}).get("run"):
            progress = 3
        if (p.report or {}).get("summary"):
            progress = 4
        out.append(
            {
                "id": p.id,
                "name": p.name,
                "work": p.work,
                "company_name": company.name,
                "workspace_id": p.workspace_id,
                "workspace_name": workspace_name,
                "steps": len(tasks),
                "progress": progress,
                "updated_at": p.updated_at,
            }
        )
    return out


@router.post("")
def create_project(
    body: ProjectCreate, account: Account | None = Depends(optional_account), db: Session = Depends(get_db)
):
    workspace = _workspace_for_new_project(db, account, body.workspace_id)
    if workspace:
        company = db.get(Company, workspace.tax_id)
    elif body.tax_id:
        company = db.get(Company, body.tax_id)
        if not company:
            raise HTTPException(400, "請先查詢統一編號，建立企業背景。")
    else:
        company = _manual_company(db, body.company_name)
    p = Project(
        **body.model_dump(exclude={"tax_id", "company_name", "workspace_id"}),
        tax_id=company.tax_id,
        account_id=account.id if account else None,
        workspace_id=workspace.id if workspace else None,
        flow={"nodes": [], "edges": []},
        messages=[],
    )
    db.add(p)
    db.commit()
    return _out(p, company)


@router.post("/demo")
def create_demo_project(
    full: bool = False,
    workspace_id: int | None = None,
    account: Account | None = Depends(optional_account),
    db: Session = Depends(get_db),
):
    """建立「小名 3C 網店」示範專案（企業資料需先以 00000000 查詢建立）。
    full=true 時載入四個階段都已完成的完整示範，使用預存的 AI 分析，不需等待 AI。"""
    company = db.get(Company, "00000000")
    if not company:
        raise HTTPException(400, "請先以案例代碼 00000000 載入示範企業。")
    workspace = _workspace_for_new_project(db, account, workspace_id)
    if full:
        p = demo_full.create(db)
        p.account_id = account.id if account else None
        p.workspace_id = workspace.id if workspace else None
        db.commit()
        return _out(p, company)
    demo_full.seed_documents(db)
    p = Project(
        tax_id="00000000",
        **DEMO_PROJECT,
        flow={},
        messages=copy.deepcopy(DEMO_MESSAGES),
        account_id=account.id if account else None,
        workspace_id=workspace.id if workspace else None,
    )
    db.add(p)
    db.flush()
    _save_flow(db, p, copy.deepcopy(DEMO_FLOW), "demo")
    db.commit()
    return _out(p, company)


@router.delete("/{project_id}", status_code=204)
def delete_project(
    project_id: int, account: Account | None = Depends(optional_account), db: Session = Depends(get_db)
):
    """刪除工作區的專案，只有該工作區的管理者可以；流程版本會一併刪除（ON DELETE CASCADE）。"""
    account = require_account(account)
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "找不到這個專案。")
    if p.workspace_id is None or member_role(db, p.workspace_id, account.id) != "ADMIN":
        raise HTTPException(403, "只有工作區的管理者可以刪除專案。")
    db.delete(p)
    db.commit()
    return Response(status_code=204)


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


def _explore_context(p: Project, company: Company) -> dict:
    return {
        "company": company.name,
        "industry": company.industry.get("label", ""),
        "work": p.work,
        "problem": p.problem,
    }


def _baked(p: Project, node) -> tuple[allocation.Exploration, list[dict]] | None:
    """示範案例的步驟若與預存時相同，直接使用預存分析，報告現場不用等 AI。"""
    baked = demo_full.baked_exploration(node.id, node.title) if p.tax_id == demo_full.DEMO_TAX_ID else None
    return (allocation.Exploration.model_validate(baked), demo_full.baked_sources(node.id, node.title)) if baked else None


def _save_explorations(db: Session, p: Project, results: dict[str, tuple[allocation.Exploration, list[dict], str]]):
    # AI 分析要幾十秒，期間企業可能已在其他步驟選好分工；重新讀取並鎖住這筆專案再合併，避免蓋掉
    db.refresh(p, with_for_update=True)
    allocs = dict(p.allocations or {})
    for node_id, (exp, sources, title) in results.items():
        allocs[node_id] = {
            "mode": allocs.get(node_id, {}).get("mode", "human"),
            "exploration": exp.model_dump(),
            "sources": sources,
            "node_title": title,
        }
    p.allocations = allocs
    db.commit()


@router.post("/{project_id}/nodes/{node_id}/explore")
def explore_node(project_id: int, node_id: str, db: Session = Depends(get_db)):
    """請 AI 探索這一步可以怎麼介入，並比較四種人機分工。"""
    p, company = _load(db, project_id)
    flow, node = _task_node(p, node_id)
    try:
        if not (done := _baked(p, node)):
            # 依這一步的內容檢索企業文件，讓分析符合企業自己的規定
            sources = rag.search(db, p.tax_id, allocation.node_query(node))
            done = (allocation.explore(_explore_context(p, company), flow, node, sources), sources)
    except llm.LLMNotConfigured as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        raise HTTPException(502, f"AI 暫時無法回應，請稍後再試。（{type(e).__name__}）")
    _save_explorations(db, p, {node_id: (*done, node.title)})
    return _out(p, company)


# 一次分析全部步驟時，同時送給 AI 的步驟數；太多會撞到 Gemini 每分鐘的請求上限
EXPLORE_WORKERS = 4


@router.post("/{project_id}/explore")
def explore_all(project_id: int, db: Session = Depends(get_db)):
    """一次分析所有還沒分析的步驟：各步驟的 AI 分析同時進行，全部完成後一起存檔。
    部分步驟失敗時，成功的照樣存下，再回報哪幾步要重試。"""
    p, company = _load(db, project_id)
    flow = Flow.model_validate(p.flow)
    analyzed = {k for k, v in (p.allocations or {}).items() if v.get("exploration")}
    nodes = [n for n in flow.nodes if n.kind not in ("start", "end") and n.id not in analyzed]
    context = _explore_context(p, company)

    results: dict[str, tuple[allocation.Exploration, list[dict], str]] = {}
    todo = []
    for n in nodes:
        if baked := _baked(p, n):
            results[n.id] = (*baked, n.title)
        else:
            # 文件檢索要用資料庫連線，先依序做完；AI 分析不碰資料庫，可以同時進行
            todo.append((n, rag.search(db, p.tax_id, allocation.node_query(n))))

    failed = []
    with ThreadPoolExecutor(max_workers=EXPLORE_WORKERS) as pool:
        futures = [(n, sources, pool.submit(allocation.explore, context, flow, n, sources)) for n, sources in todo]
        for n, sources, f in futures:
            try:
                results[n.id] = (f.result(), sources, n.title)
            except llm.LLMNotConfigured as e:
                raise HTTPException(503, str(e))
            except Exception:
                failed.append(n.title)

    if results:
        _save_explorations(db, p, results)
    if failed:
        raise HTTPException(502, f"AI 暫時無法分析：{'、'.join(failed)}。其他步驟已分析好，請再試一次。")
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
