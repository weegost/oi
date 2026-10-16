"""流程圖資料格式與缺口檢查。缺口規則是決定性的，AI 引導模式依此決定下一個追問。"""

from typing import Literal

from pydantic import BaseModel, Field

NodeKind = Literal["start", "end", "process", "wait", "decision", "handoff"]
NodeStatus = Literal["pending", "confirmed", "clarify"]


class FlowNode(BaseModel):
    id: str
    kind: NodeKind = "process"
    title: str
    role: str = Field("", description="負責角色，例如客服專員、倉管")
    system: str = Field("", description="使用的系統或工具，例如蝦皮後台、Excel")
    data: str = Field("", description="需要的資料與來源")
    condition: str = Field("", description="判斷條件；判斷節點必填")
    description: str = ""
    output: str = Field("", description="這一步的產出")
    exceptions: str = Field("", description="例外狀況與處理方式")
    status: NodeStatus = "pending"
    source: str = Field("AI 推論", description="資訊來源：企業描述／AI 推論／文件")
    x: float | None = None
    y: float | None = None


class FlowEdge(BaseModel):
    source: str
    target: str
    label: str = ""


class Flow(BaseModel):
    nodes: list[FlowNode] = []
    edges: list[FlowEdge] = []


TASK_KINDS = {"process", "wait", "decision", "handoff"}

FIELD_LABELS = {
    "role": "負責角色",
    "data": "需要的資料",
    "system": "使用的系統",
    "condition": "判斷條件",
    "branches": "判斷後的分支",
    "exceptions": "例外處理",
    "connection": "前後步驟",
    "start_end": "流程起點與終點",
}


def find_gaps(flow: Flow) -> list[dict]:
    """依重要性排序回傳缺口：[{node_id, node_title, field, label}]。"""
    gaps: list[dict] = []

    def add(node: FlowNode | None, field: str):
        gaps.append(
            {
                "node_id": node.id if node else None,
                "node_title": node.title if node else "",
                "field": field,
                "label": FIELD_LABELS[field],
            }
        )

    tasks = [n for n in flow.nodes if n.kind in TASK_KINDS]
    if not tasks:
        return gaps

    kinds = {n.kind for n in flow.nodes}
    if "start" not in kinds or "end" not in kinds:
        add(None, "start_end")

    linked = {e.source for e in flow.edges} | {e.target for e in flow.edges}
    outgoing: dict[str, int] = {}
    for e in flow.edges:
        outgoing[e.source] = outgoing.get(e.source, 0) + 1

    for n in tasks:
        if n.status == "confirmed":
            continue  # 企業已確認的節點不再追問
        if n.id not in linked:
            add(n, "connection")
        if not n.role.strip() and n.kind != "wait":
            add(n, "role")
        if n.kind == "decision":
            if not n.condition.strip():
                add(n, "condition")
            if outgoing.get(n.id, 0) < 2:
                add(n, "branches")
        elif not n.data.strip():
            add(n, "data")

    # 整條流程沒有例外處理與人工接管，是導入 AI 前最常被忽略的條件
    if "handoff" not in kinds and not any(n.exceptions.strip() for n in tasks):
        add(None, "exceptions")

    return gaps
