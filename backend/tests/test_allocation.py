"""人機分工：風險把關規則與分工 API。Gemini 以替身取代。"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app import allocation, llm
from app.allocation import Exploration, ModeOption, apply_guardrails, risk_reasons
from app.db import engine
from app.flow import FlowNode
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def cleanup():
    with engine.connect() as conn:
        last = conn.execute(text("select coalesce(max(id), 0) from projects")).scalar()
    yield
    with engine.begin() as conn:
        conn.execute(text("delete from projects where id > :last"), {"last": last})


def option(mode, fit="可行"):
    return ModeOption(
        mode=mode, ai_does="x", human_does="y", required_data=["訂單"], permissions=["讀取訂單"],
        handoff=[], risk="", fit=fit, reason="",
    )


def exploration(recommended="auto", modes=("human", "assist", "review", "auto")):
    return Exploration(ai_tasks=["t"], goal="g", options=[option(m) for m in modes], recommended=recommended)


def test_refund_step_cannot_be_recommended_auto():
    node = FlowNode(id="r", title="執行退款", role="客服")
    exp = apply_guardrails(node, exploration("auto"))
    auto = next(o for o in exp.options if o.mode == "auto")
    assert auto.fit == "不建議"
    assert exp.recommended == "review"


def test_decision_node_is_high_risk_even_without_keywords():
    assert risk_reasons(FlowNode(id="d", kind="decision", title="是否補件"))


def test_reading_payment_data_is_not_high_risk():
    node = FlowNode(id="l", title="查詢訂單資料", data="付款方式、出貨日期")
    assert risk_reasons(node) == []
    exp = apply_guardrails(node, exploration("auto"))
    assert exp.recommended == "auto"


def test_missing_options_are_filled_in_fixed_order():
    exp = apply_guardrails(FlowNode(id="a", title="整理訊息"), exploration("assist", ("assist",)))
    assert [o.mode for o in exp.options] == ["human", "assist", "review", "auto"]
    human = exp.options[0]
    assert human.ai_does == "不使用 AI" and human.permissions == []


def test_risky_step_keeps_human_option_acceptable():
    node = FlowNode(id="d", kind="decision", title="是否符合退款條件")
    raw = exploration("assist")
    raw.options[0].fit = "不建議"
    assert apply_guardrails(node, raw).options[0].fit != "不建議"


@pytest.fixture
def demo_project():
    client.get("/api/companies/00000000")
    return client.post("/api/projects/demo").json()["id"]


def test_explore_saves_exploration_and_keeps_chosen_mode(demo_project, monkeypatch):
    monkeypatch.setattr(llm, "generate_json", lambda *a, **k: exploration("assist"))
    client.put(f"/api/projects/{demo_project}/allocations/lookup", json={"mode": "review"})
    r = client.post(f"/api/projects/{demo_project}/nodes/lookup/explore")
    alloc = r.json()["allocations"]["lookup"]
    assert alloc["mode"] == "review"  # 重新探索不覆蓋企業已選的分工
    assert alloc["exploration"]["recommended"] == "assist"


def test_explore_keeps_choices_made_while_ai_was_running(demo_project, monkeypatch):
    """分析一步要幾十秒，期間企業在別的步驟選的分工不能被分析結果蓋掉。"""

    def slow_explore(*a, **k):
        # AI 還在分析時，企業已在另一步選好分工（直接寫進資料庫模擬另一個請求）
        with engine.begin() as conn:
            conn.execute(
                text("update projects set allocations = allocations || cast(:a as jsonb) where id = :id"),
                {"a": '{"notify": {"mode": "auto"}}', "id": demo_project},
            )
        return exploration("assist")

    monkeypatch.setattr(llm, "generate_json", slow_explore)
    allocs = client.post(f"/api/projects/{demo_project}/nodes/lookup/explore").json()["allocations"]
    assert allocs["notify"]["mode"] == "auto"
    assert allocs["lookup"]["exploration"]["recommended"] == "assist"


def task_ids(pid):
    flow = client.get(f"/api/projects/{pid}").json()["flow"]
    return [n["id"] for n in flow["nodes"] if n["kind"] not in ("start", "end")]


def test_explore_all_analyzes_every_step_in_one_request(demo_project, monkeypatch):
    calls = []
    monkeypatch.setattr(llm, "generate_json", lambda *a, **k: (calls.append(1), exploration("assist"))[1])
    client.put(f"/api/projects/{demo_project}/allocations/lookup", json={"mode": "review"})
    allocs = client.post(f"/api/projects/{demo_project}/explore").json()["allocations"]
    assert all(allocs[i]["exploration"] for i in task_ids(demo_project))
    assert len(calls) == len(task_ids(demo_project))
    assert allocs["lookup"]["mode"] == "review"  # 先選好的分工不被分析結果蓋掉
    # 已分析過的步驟不再重送 AI
    client.post(f"/api/projects/{demo_project}/explore")
    assert len(calls) == len(task_ids(demo_project))


def test_explore_all_keeps_finished_steps_when_one_fails(demo_project, monkeypatch):
    def flaky(prompt, *a, **k):
        if "「查詢訂單資料」" in prompt:
            raise RuntimeError("503")
        return exploration("assist")

    monkeypatch.setattr(llm, "generate_json", flaky)
    r = client.post(f"/api/projects/{demo_project}/explore")
    assert r.status_code == 502 and "查詢訂單資料" in r.json()["detail"]
    allocs = client.get(f"/api/projects/{demo_project}").json()["allocations"]
    assert "lookup" not in allocs or not allocs["lookup"].get("exploration")
    assert sum(1 for i in task_ids(demo_project) if allocs.get(i, {}).get("exploration")) == len(task_ids(demo_project)) - 1


def test_cannot_allocate_start_or_unknown_node(demo_project):
    assert client.put(f"/api/projects/{demo_project}/allocations/start", json={"mode": "auto"}).status_code == 404
    assert client.put(f"/api/projects/{demo_project}/allocations/nope", json={"mode": "auto"}).status_code == 404


def test_deleted_node_allocation_is_hidden(demo_project):
    client.put(f"/api/projects/{demo_project}/allocations/notify", json={"mode": "auto"})
    flow = client.get(f"/api/projects/{demo_project}").json()["flow"]
    flow["nodes"] = [n for n in flow["nodes"] if n["id"] != "notify"]
    assert "notify" not in client.put(f"/api/projects/{demo_project}/flow", json=flow).json()["allocations"]


def test_ai_failure_returns_502(demo_project, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("503")

    monkeypatch.setattr(allocation.llm, "generate_json", boom)
    assert client.post(f"/api/projects/{demo_project}/nodes/lookup/explore").status_code == 502
