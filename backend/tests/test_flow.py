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


def test_confirmed_node_is_not_asked_again():
    flow = Flow(nodes=[node("a", status="confirmed")], edges=[])
    assert not any(g["node_id"] == "a" for g in find_gaps(flow))


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
