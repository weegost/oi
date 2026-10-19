"""流程建模 Agent（LangGraph）。

retrieve → update_flow → check_gaps → respond
- retrieve：依企業這次說的內容（或下一個要追問的缺口）檢索企業文件，供後續步驟參考並回報來源。
- 直接描述（direct）：依企業描述更新流程，簡短回報仍缺的資訊，不主動追問。
- AI 引導（guided）：更新流程後，挑出最重要的一個缺口，從最近一次實際案例切入追問。
"""

import json
from collections.abc import Callable
from typing import Literal, TypedDict

from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field

from . import llm, rag
from .flow import Flow, FlowEdge, FlowNode, find_gaps

Mode = Literal["direct", "guided"]

SYSTEM = """你是「智行進業」的流程建模助理，協助台灣中小企業把日常工作整理成流程圖。
原則：
- 只記錄企業「目前實際怎麼做」，不要提出 AI 導入建議，也不要美化流程。
- 企業沒說的細節不要編造；可以合理推論的寫進節點，但 source 標為「AI 推論」，企業明確說過的標為「企業描述」。
- 使用繁體中文，用企業聽得懂的話，不用流程分析術語。
- 企業文件寫的是「規定」，企業描述的是「實際做法」；兩者不同時以企業描述為準，文件只用來補充細節。"""

Retriever = Callable[[str], list[dict]]  # 查詢文字 → 文件段落


class LLMNode(BaseModel):
    id: str = Field(description="沿用既有節點 id；新節點用 n1、n2… 不重複")
    kind: Literal["start", "end", "process", "wait", "decision", "handoff"]
    title: str = Field(description="10 字內的動作名稱，例如「查詢訂單狀態」")
    role: str = ""
    system: str = ""
    data: str = ""
    condition: str = ""
    description: str = ""
    output: str = ""
    exceptions: str = ""
    source: Literal["企業描述", "AI 推論", "文件"] = "AI 推論"


class FlowUpdate(BaseModel):
    nodes: list[LLMNode]
    edges: list[FlowEdge]
    summary: str = Field(description="一兩句話說明這次更新了什麼")


class AgentState(TypedDict, total=False):
    mode: Mode
    context: dict  # 企業與專案背景
    flow: dict
    history: list[dict]
    message: str
    reply: str
    gaps: list[dict]
    docs: list[dict]  # 檢索到的企業文件段落


def _context_text(state: AgentState) -> str:
    c = state["context"]
    return (
        f"企業：{c.get('company')}（{c.get('industry')}）\n"
        f"想改善的工作：{c.get('work')}\n目前問題：{c.get('problem')}\n分析範圍：{c.get('scope')}"
    )


def _history_text(state: AgentState, limit: int = 8) -> str:
    rows = state.get("history", [])[-limit:]
    return "\n".join(f"{'企業' if m['role'] == 'user' else '助理'}：{m['text']}" for m in rows) or "（尚無）"


def merge_flow(old: Flow, update: FlowUpdate) -> Flow:
    """保留企業已確認的節點與畫布位置；其餘以模型更新為準。"""
    old_by_id = {n.id: n for n in old.nodes}
    nodes = []
    for n in update.nodes:
        prev = old_by_id.get(n.id)
        if prev and prev.status == "confirmed":
            nodes.append(prev)
            continue
        data = n.model_dump()
        if prev:
            data.update(x=prev.x, y=prev.y, status=prev.status)
        nodes.append(FlowNode(**data))
    # 已確認但模型漏掉的節點仍保留
    kept = {n.id for n in nodes}
    nodes += [n for n in old.nodes if n.status == "confirmed" and n.id not in kept]

    ids = {n.id for n in nodes}
    edges, seen = [], set()
    for e in update.edges:
        key = (e.source, e.target)
        if e.source in ids and e.target in ids and key not in seen:
            seen.add(key)
            edges.append(e)
    return Flow(nodes=nodes, edges=edges)


def retrieve(state: AgentState, config: RunnableConfig) -> AgentState:
    retriever: Retriever | None = config.get("configurable", {}).get("retriever")
    if not retriever:
        return {"docs": []}
    # 只用企業這次說的話檢索；若混入專案主題（例如「處理退貨」），無關的問題也會找到退貨文件
    query = state.get("message", "").strip()
    if not query:  # AI 引導、企業還沒開口：用下一個要追問的缺口去找文件
        gaps = find_gaps(Flow.model_validate(state["flow"]))
        if gaps:
            query = f"{state['context'].get('work', '')} {gaps[0]['node_title']} {gaps[0]['label']}"
    if not query:
        return {"docs": []}
    return {"docs": retriever(query)}


def update_flow(state: AgentState) -> AgentState:
    message = state.get("message", "").strip()
    if not message:
        return {}
    current = Flow.model_validate(state["flow"])
    prompt = f"""{_context_text(state)}

目前流程（JSON）：
{current.model_dump_json(exclude={"nodes": {"__all__": {"x", "y"}}})}

最近對話：
{_history_text(state)}

{rag.as_prompt(state.get("docs", []))}
企業剛剛說：
{message}

請依企業剛剛說的內容，輸出「完整」更新後的流程：
- 保留仍然正確的節點與 id；企業這次沒提到的節點與欄位一律原樣保留，不要改寫。
- 只修改或補充企業這次提到的內容；新增步驟給新 id；企業說某步驟不存在才刪除。
- 第一個節點 kind=start，最後一個 kind=end；有判斷就用 decision，並用 edges 的 label 標出分支（例如「是」「否」）。
- 交由特定人員處理例外的步驟用 handoff；等待客戶或外部回覆用 wait。
- edges 依實際順序連接。
- 企業文件中與這次內容相關的規定（例如期限、條件、例外處理），可補進對應節點的 condition、data、exceptions；
  主要依據文件補充的節點 source 標「文件」。不要因為文件提到就新增企業沒說過的步驟。"""
    update = llm.generate_json(prompt, FlowUpdate, system=SYSTEM)
    flow = merge_flow(current, update)
    return {"flow": flow.model_dump(), "reply": update.summary}


def check_gaps(state: AgentState) -> AgentState:
    return {"gaps": find_gaps(Flow.model_validate(state["flow"]))}


def respond(state: AgentState) -> AgentState:
    summary = state.get("reply", "")
    gaps = state.get("gaps", [])
    flow = Flow.model_validate(state["flow"])

    if state["mode"] == "direct":
        if not state.get("message"):
            return {"reply": "請直接描述目前這項工作是怎麼完成的，我會整理成流程圖。"}
        tail = (
            f"目前還有 {len(gaps)} 項資訊待補（例如「{gaps[0]['node_title'] or '整體流程'}」的{gaps[0]['label']}）。"
            "可以繼續描述，或切換到「AI 引導」由我逐一詢問。"
            if gaps
            else "流程資訊已大致完整，請逐一確認節點內容。"
        )
        return {"reply": f"{summary}\n\n{tail}".strip()}

    # AI 引導
    if not flow.nodes:
        target = "請企業從「最近一次實際處理這項工作的案例」開始描述：當時誰收到什麼、接著做了什麼"
    elif gaps:
        g = gaps[0]
        where = f"「{g['node_title']}」這一步" if g["node_title"] else "整體流程"
        target = f"補齊{where}的{g['label']}"
    else:
        return {"reply": f"{summary}\n\n流程資訊已大致完整，請在右側逐一確認節點；確認後就可以進入 AI 介入探索。".strip()}

    prompt = f"""{_context_text(state)}

目前流程節點：{json.dumps([{"id": n.id, "title": n.title, "role": n.role} for n in flow.nodes], ensure_ascii=False)}

最近對話：
{_history_text(state)}

這一輪要問的重點：{target}

{rag.as_prompt(state.get("docs", []))}
請寫「一個」追問：
- 用最近一次實際案例來問（例如「上次遇到…時，是誰…？」），不要問抽象的流程問題。
- 一次只問一件事，60 字以內，口語、友善。
- 文件已經寫清楚的規定不要再問；可以改問「實際上是不是照文件做」或文件沒寫到的情況。
- 只輸出問題本身。"""
    question, _ = llm.generate(prompt, system=SYSTEM)
    return {"reply": f"{summary}\n\n{question.strip()}".strip()}


def build_graph():
    g = StateGraph(AgentState)
    g.add_node("retrieve", retrieve)
    g.add_node("update_flow", update_flow)
    g.add_node("check_gaps", check_gaps)
    g.add_node("respond", respond)
    g.add_edge(START, "retrieve")
    g.add_edge("retrieve", "update_flow")
    g.add_edge("update_flow", "check_gaps")
    g.add_edge("check_gaps", "respond")
    g.add_edge("respond", END)
    return g.compile()


graph = build_graph()


def run(
    mode: Mode, context: dict, flow: dict, history: list[dict], message: str, retriever: Retriever | None = None
) -> AgentState:
    return graph.invoke(
        {"mode": mode, "context": context, "flow": flow, "history": history, "message": message},
        config={"configurable": {"retriever": retriever}},
    )
