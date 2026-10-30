"""流程建模 Agent（LangGraph）。

retrieve → update_flow → check_gaps → respond
- retrieve：依企業這次說的內容（或下一個要追問的缺口）檢索企業文件，供後續步驟參考並回報來源。
- 直接描述（direct）：依企業描述更新流程，簡短回報仍缺的資訊，不主動追問。
- AI 引導（guided）：只記錄企業說過的內容，不推算；照順序一題一題問，先問「接下來呢」把流程走完，再問每一步缺的資訊。
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
- 只寫企業明確說過的內容，不要推算或補完：企業沒說的步驟、負責人、系統、資料、判斷條件、例外處理一律留空，之後再一題一題問。
- 使用繁體中文，用企業聽得懂的話，不用流程分析術語。
- 企業文件寫的是「規定」，企業描述的是「實際做法」；文件只用來決定要問什麼，不要把文件內容直接填進流程。"""

Retriever = Callable[[str], list[dict]]  # 查詢文字 → 文件段落

# 企業確認過的節點仍可由 AI 補上空白的這些欄位
FILLABLE = ("role", "system", "data", "condition", "description", "output", "exceptions")


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
    """保留企業已確認的節點與畫布位置；其餘以模型更新為準。
    已確認的節點不改名稱與已填內容，但企業後來補充的資訊可以填進原本空白的欄位，
    否則 AI 追問的答案存不進去，同一題會一直被問。"""
    old_by_id = {n.id: n for n in old.nodes}
    nodes = []
    for n in update.nodes:
        prev = old_by_id.get(n.id)
        if prev and prev.status == "confirmed":
            blanks = {f: getattr(n, f) for f in FILLABLE if not getattr(prev, f).strip() and getattr(n, f).strip()}
            nodes.append(prev.model_copy(update=blanks))
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
- 只把企業這次「明確說出」的內容寫進流程：新增步驟給新 id；企業說某步驟不存在才刪除。
- 不要推算：企業沒說的步驟、分支、負責人、系統、資料、判斷條件都不要自己補，欄位留空即可。
  不要為了讓流程看起來完整而自行加上後續步驟或結束。
- 企業說了工作怎麼開始，才加 kind=start 的節點；企業明確說這件事到哪裡就結束了，才加 kind=end 的節點。
- 企業說到「如果…就…」這類判斷時用 decision，並用 edges 的 label 標出企業說的分支（例如「是」「否」）。
- 交由特定人員處理例外的步驟用 handoff；等待客戶或外部回覆用 wait。
- edges 依企業說的順序連接。
- 企業文件只用來理解企業說的話，不要把文件裡的規定填進節點；所有節點的 source 填「企業描述」。"""
    update = llm.generate_json(prompt, FlowUpdate, system=SYSTEM)
    flow = merge_flow(current, update)
    return {"flow": flow.model_dump(), "reply": update.summary}


def check_gaps(state: AgentState) -> AgentState:
    return {"gaps": find_gaps(Flow.model_validate(state["flow"]))}


def _open_end(flow: Flow) -> FlowNode | None:
    """流程還沒走到結束的地方：沒有下一步、也不是結束的節點（取最後一個）。"""
    has_next = {e.source for e in flow.edges}
    open_nodes = [n for n in flow.nodes if n.kind != "end" and n.id not in has_next]
    return open_nodes[-1] if open_nodes else None


def _gap_target(flow: Flow, g: dict) -> str:
    """把缺口寫成具體要問的事。只給欄位名稱（例如「判斷後的分支」）時，模型常誤問成「怎麼判斷」，
    企業回答了缺口卻沒補上，同一題就一直重問。"""
    step = f"「{g['node_title']}」這一步"
    if g["field"] == "branches":
        known = [e.label for e in flow.edges if e.source == g["node_id"] and e.label]
        have = f"已經知道「{'、'.join(known)}」之後怎麼做" if known else "還不知道判斷完之後怎麼走"
        return f"{step}{have}；問另一種情況（例如不符合時）接下來是誰做什麼。判斷條件已經知道，不要再問怎麼判斷"
    asks = {
        "role": f"{step}是誰做的",
        "data": f"做{step}時要看或用到哪些資料",
        "condition": f"{step}是看什麼來判斷",
        "connection": f"{step}的前一步或下一步是什麼",
        "exceptions": "遇到特殊、處理不了的情況時，交給誰處理",
        "start_end": "這件事從哪裡開始、做到哪裡算結束",
    }
    return asks.get(g["field"], f"補齊{step}的{g['label']}")


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

    # AI 引導：照順序一步一步問。先把流程從頭走到尾（每次只問「接下來呢」），走完再回頭問每一步缺的資訊。
    # 更新摘要是寫給模型的內部說明（例如「企業詢問…，流程保持不變」），不顯示給企業；流程圖改了哪裡由畫面標示
    open_end = _open_end(flow)
    if not flow.nodes:
        target = "請企業從「最近一次實際處理這項工作的案例」開始說：一開始是誰收到什麼"
    elif open_end:
        target = f"「{open_end.title}」做完之後，接下來是誰做什麼；如果這件事到這裡就結束了，也請企業說一聲"
    elif gaps:
        target = _gap_target(flow, gaps[0])
    else:
        return {"reply": "流程資訊已大致完整，請在右側逐一確認節點；確認後就可以進入 AI 介入探索。"}

    prompt = f"""{_context_text(state)}

目前流程節點：{json.dumps([{"id": n.id, "title": n.title, "role": n.role} for n in flow.nodes], ensure_ascii=False)}

最近對話：
{_history_text(state)}

這一輪要問的重點：{target}

{rag.as_prompt(state.get("docs", []))}
請寫「一個」追問：
- 用最近一次實際案例來問（例如「上次遇到…時，是誰…？」），不要問抽象的流程問題。
- 一次只問一件事，60 字以內，口語、友善。
- 不要在問題裡替企業猜答案，也不要先列出選項讓企業挑；讓企業用自己的話說。
- 企業在最近對話裡已經回答過的事不要再問；如果上一題問過類似的，換個說法，直接點出還缺的那一塊。
- 文件已經寫清楚的規定不要再問；可以改問「實際上是不是照文件做」或文件沒寫到的情況。
- 只輸出問題本身。"""
    question, _ = llm.generate(prompt, system=SYSTEM)
    return {"reply": question.strip()}


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
