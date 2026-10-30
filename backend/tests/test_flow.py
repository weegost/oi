"""流程缺口規則、合併規則與專案 API。Gemini 以替身取代，不消耗額度。"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app import agent, llm
from app.db import engine
from app.demo import DEMO_FLOW
from app.flow import Flow, FlowEdge, FlowNode, find_gaps
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def cleanup():
    with engine.connect() as conn:
        last = conn.execute(text("select coalesce(max(id), 0) from projects")).scalar()
    yield
    with engine.begin() as conn:
        conn.execute(text("delete from projects where id > :last"), {"last": last})


def node(id, kind="process", **kw):
    return FlowNode(id=id, kind=kind, title=id, **kw)


def fields(gaps):
    return {(g["node_id"], g["field"]) for g in gaps}


def test_empty_flow_has_no_gaps():
    assert find_gaps(Flow()) == []


def test_decision_needs_condition_and_two_branches():
    flow = Flow(
        nodes=[node("s", "start"), node("d", "decision", role="主管"), node("e", "end")],
        edges=[FlowEdge(source="s", target="d"), FlowEdge(source="d", target="e")],
    )
    gaps = fields(find_gaps(flow))
    assert ("d", "condition") in gaps
    assert ("d", "branches") in gaps


def test_confirmed_node_still_lists_missing_info():
    flow = Flow(nodes=[node("a", status="confirmed")], edges=[])
    assert ("a", "role") in fields(find_gaps(flow))


def test_missing_exception_handling_is_flagged():
    flow = Flow(nodes=[node("a", role="客服", data="訂單")], edges=[])
    assert (None, "exceptions") in fields(find_gaps(flow))


def test_demo_flow_leaves_exception_branch_gap():
    # 示範時 AI 引導要能追問「例外案件」，這個缺口必須存在
    assert ("decision", "branches") in fields(find_gaps(Flow.model_validate(DEMO_FLOW)))


def test_merge_keeps_confirmed_nodes_and_positions():
    old = Flow(
        nodes=[node("a", status="confirmed", role="客服"), node("b", x=10, y=20)],
        edges=[FlowEdge(source="a", target="b")],
    )
    update = agent.FlowUpdate(
        nodes=[
            agent.LLMNode(id="a", kind="process", title="被改掉", role="主管"),
            agent.LLMNode(id="b", kind="process", title="b2"),
            agent.LLMNode(id="c", kind="process", title="c"),
        ],
        edges=[
            FlowEdge(source="a", target="b"),
            FlowEdge(source="b", target="c"),
            FlowEdge(source="b", target="ghost"),  # 指向不存在節點的連線要丟掉
        ],
        summary="",
    )
    merged = agent.merge_flow(old, update)
    by_id = {n.id: n for n in merged.nodes}
    assert by_id["a"].title == "a" and by_id["a"].role == "客服"
    assert (by_id["b"].title, by_id["b"].x, by_id["b"].y) == ("b2", 10, 20)
    assert len(merged.edges) == 2


def test_merge_fills_blank_fields_of_confirmed_node():
    """已確認的步驟：空白欄位可以補上企業後來的回答，已填的內容與名稱不變。"""
    old = Flow(nodes=[node("a", status="confirmed", role="客服")], edges=[])
    update = agent.FlowUpdate(
        nodes=[agent.LLMNode(id="a", kind="process", title="被改掉", role="主管", data="寄回地址")],
        edges=[],
        summary="",
    )
    a = agent.merge_flow(old, update).nodes[0]
    assert (a.title, a.role, a.data, a.status) == ("a", "客服", "寄回地址", "confirmed")


def fake_update(prompt, schema, system=None):
    return agent.FlowUpdate(
        nodes=[
            agent.LLMNode(id="n1", kind="start", title="開始"),
            agent.LLMNode(id="n2", kind="process", title="查訂單", role="客服"),
            agent.LLMNode(id="n3", kind="end", title="結束"),
        ],
        edges=[FlowEdge(source="n1", target="n2"), FlowEdge(source="n2", target="n3")],
        summary="已建立 1 個步驟。",
    )


@pytest.fixture
def project(monkeypatch):
    monkeypatch.setattr(llm, "generate_json", fake_update)
    monkeypatch.setattr(llm, "generate", lambda prompt, system=None: ("上次是誰查訂單的？", "fake"))
    client.get("/api/companies/00000000")
    r = client.post("/api/projects", json={"tax_id": "00000000", "name": "測試專案"})
    assert r.status_code == 200
    return r.json()["id"]


def test_direct_mode_updates_flow_without_asking(project):
    r = client.post(f"/api/projects/{project}/chat", json={"mode": "direct", "message": "客服查訂單"})
    body = r.json()
    assert len(body["flow"]["nodes"]) == 3
    assert "上次是誰" not in body["messages"][-1]["text"]
    assert [m["role"] for m in body["messages"]] == ["user", "assistant"]


def test_guided_mode_asks_one_question(project):
    client.post(f"/api/projects/{project}/chat", json={"mode": "direct", "message": "客服查訂單"})
    r = client.post(f"/api/projects/{project}/chat", json={"mode": "guided", "message": ""})
    assert r.json()["messages"][-1]["text"].endswith("上次是誰查訂單的？")


def test_guided_reply_hides_update_summary(project):
    """更新摘要是給模型看的內部說明，AI 引導只回問題本身。"""
    r = client.post(f"/api/projects/{project}/chat", json={"mode": "guided", "message": "客服查訂單"})
    assert r.json()["messages"][-1]["text"] == "上次是誰查訂單的？"


def guided_target(flow: Flow, monkeypatch) -> str:
    """跑 AI 引導的回覆，回傳這一輪要問的重點（從送給 AI 的提示中取出）。"""
    prompts = []
    monkeypatch.setattr(llm, "generate", lambda prompt, system=None: (prompts.append(prompt), ("問題", "fake"))[1])
    state = {"mode": "guided", "context": {}, "flow": flow.model_dump(), "history": [], "gaps": find_gaps(flow)}
    agent.respond(state)
    return next(line for line in prompts[0].splitlines() if line.startswith("這一輪要問的重點"))


def test_guided_asks_what_happens_next_before_details(monkeypatch):
    """流程還沒走到結束時，先問最後一步之後接著做什麼，不先追問細節。"""
    flow = Flow(nodes=[node("開始", "start"), node("查訂單")], edges=[FlowEdge(source="開始", target="查訂單")])
    target = guided_target(flow, monkeypatch)
    assert "「查訂單」做完之後" in target and "誰負責" not in target


def test_guided_asks_details_once_flow_reaches_end(monkeypatch):
    flow = Flow(
        nodes=[node("開始", "start"), node("查訂單"), node("結束", "end")],
        edges=[FlowEdge(source="開始", target="查訂單"), FlowEdge(source="查訂單", target="結束")],
    )
    target = guided_target(flow, monkeypatch)
    assert "做完之後" not in target and "「查訂單」這一步" in target


def test_guided_asks_other_branch_not_how_to_decide(monkeypatch):
    """判斷只有一條路時，要問「另一種情況怎麼辦」；若問成「怎麼判斷」，企業回答了缺口也補不上，會一直重問。"""
    flow = Flow(
        nodes=[
            node("開始", "start"),
            node("確認條件", "decision", role="主管", condition="有沒有超過 7 天"),
            node("通知客戶", role="客服", data="訂單"),
            node("結束", "end"),
        ],
        edges=[
            FlowEdge(source="開始", target="確認條件"),
            FlowEdge(source="確認條件", target="通知客戶", label="符合條件"),
            FlowEdge(source="通知客戶", target="結束"),
        ],
    )
    target = guided_target(flow, monkeypatch)
    assert "「符合條件」" in target and "另一種情況" in target and "不要再問怎麼判斷" in target


def test_ai_failure_leaves_flow_unchanged(project, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("503")

    monkeypatch.setattr(llm, "generate_json", boom)
    r = client.post(f"/api/projects/{project}/chat", json={"mode": "direct", "message": "x"})
    assert r.status_code == 502
    assert client.get(f"/api/projects/{project}").json()["flow"]["nodes"] == []


def test_manual_save_creates_version(project):
    flow = {"nodes": [{"id": "a", "title": "人工新增", "status": "confirmed"}], "edges": []}
    r = client.put(f"/api/projects/{project}/flow", json=flow)
    assert r.json()["flow"]["nodes"][0]["status"] == "confirmed"
    assert client.get(f"/api/projects/{project}/versions").json()[0]["source"] == "manual"


def test_demo_project_loads_without_ai():
    client.get("/api/companies/00000000")
    body = client.post("/api/projects/demo").json()
    assert body["company_name"] == "小名 3C 網店"
    assert len(body["flow"]["nodes"]) == 6
