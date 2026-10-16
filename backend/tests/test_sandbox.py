"""開放資料匯入與情境沙盒。官方網站以替身或快照取代，不連網。"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text

from app import opendata
from app.db import SessionLocal, engine
from app.demo import DEMO_FLOW
from app.flow import Flow
from app.main import app
from app.models import DataSync, PenaltyCase
from app.sandbox import engine as sandbox
from app.sandbox.engine import CONDITIONS

client = TestClient(app)
ALL = {k: True for k in CONDITIONS}

SAMPLE_XML = """<?xml version="1.0" encoding="UTF-8"?><bsmi>
<row><處分日期>20260904</處分日期><處分文號>X1</處分文號><陳列銷售或裝設地點>某店</陳列銷售或裝設地點>
<違反條文>第6條</違反條文><被處分人>王小明</被處分人><聯絡人電話>0912</聯絡人電話><商品分類>行動電源</商品分類><實體或網路>網路</實體或網路></row>
<row><處分日期>20260904</處分日期><處分文號>X1</處分文號><違反條文>第11條</違反條文><被處分人>王小明</被處分人><商品分類>行動電源</商品分類><實體或網路>網路</實體或網路></row>
<row><處分日期>20260904</處分日期><處分文號>X1</處分文號><違反條文>第6條</違反條文><商品分類>鍵盤</商品分類><實體或網路>網路</實體或網路></row>
</bsmi>""".encode()


@pytest.fixture(scope="module", autouse=True)
def open_data_loaded():
    with SessionLocal() as db:
        opendata.load_snapshots(db)
        if not db.scalar(select(func.count()).select_from(PenaltyCase)):
            opendata.sync_penalties(db, fetch=lambda url: (_ for _ in ()).throw(OSError("offline")))


@pytest.fixture(autouse=True)
def cleanup():
    with engine.connect() as conn:
        last = conn.execute(text("select coalesce(max(id), 0) from projects")).scalar()
    yield
    with engine.begin() as conn:
        conn.execute(text("delete from projects where id > :last"), {"last": last})


# ---- 開放資料 ----


def test_penalty_rows_merge_violations_and_drop_personal_data():
    rows = opendata.parse_penalty_xml(SAMPLE_XML, "電子")
    assert len(rows) == 2  # (X1, 行動電源) 與 (X1, 鍵盤)
    power = next(r for r in rows if r["category"] == "行動電源")
    assert power["violation"] == "第6條；第11條"
    assert not any("王小明" in str(v) or "0912" in str(v) for r in rows for v in r.values())


def test_sync_falls_back_to_snapshot_when_offline():
    with SessionLocal() as db:
        db.commit = db.flush  # 測試結束後 rollback，不影響開發資料
        result = opendata.sync_penalties(db, fetch=lambda url: (_ for _ in ()).throw(OSError("offline")))
        assert all(r["source"] == "snapshot" and r["rows"] > 0 for r in result.values())
        assert db.get(DataSync, "處分案件-電子").source == "snapshot"
        db.rollback()


def test_complaint_trend_skips_unfinished_months():
    with SessionLocal() as db:
        trend = opendata.complaint_trend(db, "電器及周邊產品")
    assert trend and all(t["count"] > 0 for t in trend)


# ---- 沙盒引擎 ----


def flow_with_handoff() -> Flow:
    """示範流程加上 AI 引導常補出的「轉交主管處理」。"""
    f = Flow.model_validate(DEMO_FLOW)
    data = f.model_dump()
    data["nodes"].append({"id": "handoff", "kind": "handoff", "title": "轉交主管處理", "role": "客服主管"})
    data["edges"].append({"source": "decision", "target": "handoff", "label": "例外"})
    return Flow.model_validate(data)


SAFE_ALLOC = {"receive": {"mode": "assist"}, "lookup": {"mode": "auto"}, "decision": {"mode": "review"}, "notify": {"mode": "review"}}


def run(flow, alloc, config, scenario=None):
    with SessionLocal() as db:
        return {r["id"]: r for r in sandbox.run(flow, alloc, config, db, [scenario] if scenario else None)}


def test_all_human_flow_tests_nothing_about_ai():
    r = run(flow_with_handoff(), {}, {}, "客服")["cs-warranty"]
    assert r["disposition"] == "人工處理"
    assert r["gaps"] == []


def test_ready_conditions_let_ai_complete_normal_cases():
    results = run(flow_with_handoff(), SAFE_ALLOC, ALL)
    assert results["return-normal"]["disposition"] == "AI 協助完成"
    assert results["cs-warranty"]["disposition"] == "AI 協助完成"


def test_risky_cases_are_handed_to_people():
    results = run(flow_with_handoff(), SAFE_ALLOC, ALL)
    for case in ("return-overheat", "return-recall", "dispute-overdue", "delay-stuck"):
        assert results[case]["disposition"] == "正確轉人工", case
    assert any("召回" in e["source"] for e in results["return-recall"]["evidence"])
    assert any("處分" in e["source"] for e in results["return-overheat"]["evidence"])


def test_missing_conditions_show_up_as_gaps_with_condition_keys():
    r = run(flow_with_handoff(), SAFE_ALLOC, {}, "退貨")["return-normal"]
    conditions = {g["condition"] for g in r["gaps"]}
    assert {"api_connected", "docs_ready"} <= conditions


def test_recall_is_missed_without_open_data():
    r = run(flow_with_handoff(), SAFE_ALLOC, {**ALL, "open_data": False}, "退貨")["return-recall"]
    assert any(g["condition"] == "open_data" for g in r["gaps"])
    assert r["evidence"] == []


def test_auto_decision_on_risky_case_needs_human():
    alloc = {**SAFE_ALLOC, "decision": {"mode": "auto"}}
    r = run(flow_with_handoff(), alloc, ALL, "退貨")["return-overheat"]
    assert any(g["type"] == "人工接管" for g in r["gaps"])


def test_flow_without_handoff_step_is_flagged():
    r = run(Flow.model_validate(DEMO_FLOW), SAFE_ALLOC, ALL, "退貨")["return-overheat"]
    assert any("沒有人工接管步驟" in g["issue"] for g in r["gaps"])


def test_missing_order_number_waits_for_customer():
    r = run(flow_with_handoff(), SAFE_ALLOC, ALL, "退貨")["return-missing"]
    assert not any("POST /api/mock/refunds" in t["api"] for t in r["trace"])
    no_rule = run(flow_with_handoff(), SAFE_ALLOC, {**ALL, "required_fields": False}, "退貨")["return-missing"]
    assert any(g["condition"] == "required_fields" for g in no_rule["gaps"])


# ---- API ----


def test_run_endpoint_saves_config_and_counts_runs():
    client.get("/api/companies/00000000")
    pid = client.post("/api/projects/demo").json()["id"]
    first = client.post(f"/api/projects/{pid}/sandbox/run", json={"config": {}, "scenarios": ["物流延誤"]}).json()
    second = client.post(f"/api/projects/{pid}/sandbox/run", json={"config": {"api_connected": True}}).json()
    assert first["run"] == 1 and len(first["results"]) == 1
    assert second["run"] == 2 and second["config"]["api_connected"] is True
    assert client.get(f"/api/projects/{pid}/sandbox").json()["run"] == 2


def test_mock_refund_rejects_amount_over_order():
    assert client.post("/api/mock/refunds", json={"order_id": "A1001", "amount": 99999, "reason": "x"}).status_code == 400
    assert client.get("/api/mock/orders/A9999").status_code == 404
