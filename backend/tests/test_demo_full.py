"""一鍵載入完整示範：不呼叫 AI，四個階段的資料都已就緒。"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app import demo_full, llm
from app.db import engine
from app.demo import DEMO_FULL_FLOW, DEMO_FULL_MODES
from app.main import app

client = TestClient(app)


def fake_exploration(title):
    opt = lambda m: {  # noqa: E731
        "mode": m, "ai_does": f"{title}-{m}", "human_does": "人", "required_data": ["訂單"], "permissions": ["讀取訂單"],
        "handoff": ["例外轉主管"], "risk": "", "fit": "可行", "reason": "",
    }
    return {"ai_tasks": ["t"], "goal": "g", "options": [opt(m) for m in ("human", "assist", "review", "auto")], "recommended": "assist"}


TITLES = {n["id"]: n["title"] for n in DEMO_FULL_FLOW["nodes"]}
FAKE_BAKED = {
    "explorations": {nid: {"node_title": TITLES[nid], "exploration": fake_exploration(TITLES[nid])} for nid in DEMO_FULL_MODES},
    "summary": "預存摘要。",
}


@pytest.fixture(autouse=True)
def setup(monkeypatch):
    def no_ai(*a, **k):
        raise AssertionError("完整示範不應呼叫 AI")

    monkeypatch.setattr(llm, "generate", no_ai)
    monkeypatch.setattr(llm, "generate_json", no_ai)
    monkeypatch.setattr(demo_full, "load_baked", lambda: FAKE_BAKED)
    client.get("/api/companies/00000000")
    with engine.connect() as conn:
        last = conn.execute(text("select coalesce(max(id), 0) from projects")).scalar()
    yield
    with engine.begin() as conn:
        conn.execute(text("delete from projects where id > :last"), {"last": last})


def test_full_demo_has_every_stage_ready():
    p = client.post("/api/projects/demo?full=true").json()
    assert all(n["status"] == "confirmed" for n in p["flow"]["nodes"])
    assert p["gaps"] == []
    assert all("exploration" in a for a in p["allocations"].values())
    assert p["allocations"]["decision"]["mode"] == "review"

    sb = client.get(f"/api/projects/{p['id']}/sandbox").json()
    assert sb["run"] == 1 and not sb["stale"]
    dispositions = {r["id"]: r["disposition"] for r in sb["results"]}
    assert dispositions["return-overheat"] == "正確轉人工"
    assert dispositions["return-normal"] == "AI 協助完成"
    assert dispositions["return-missing"] == "需補足條件"

    r = client.get(f"/api/projects/{p['id']}/report").json()
    assert r["ai_summary"] == "預存摘要。"
    assert [g["type"] for g in r["gaps"]] == ["資料不足"]  # 刻意保留補件規則未具備


def test_saving_layout_keeps_sandbox_fresh():
    p = client.post("/api/projects/demo?full=true").json()
    flow = p["flow"]
    for i, n in enumerate(flow["nodes"]):  # 前端自動排列後存回座標
        n["x"], n["y"] = 0, i * 100
    client.put(f"/api/projects/{p['id']}/flow", json=flow)
    assert not client.get(f"/api/projects/{p['id']}/sandbox").json()["stale"]


def test_demo_exploration_uses_baked_result_without_ai():
    pid = client.post("/api/projects/demo").json()["id"]
    r = client.post(f"/api/projects/{pid}/nodes/lookup/explore")
    assert r.status_code == 200
    assert r.json()["allocations"]["lookup"]["exploration"]["options"][1]["ai_does"] == "查詢訂單資料-assist"


def test_renamed_demo_step_falls_back_to_ai(monkeypatch):
    pid = client.post("/api/projects/demo").json()["id"]
    flow = client.get(f"/api/projects/{pid}").json()["flow"]
    next(n for n in flow["nodes"] if n["id"] == "lookup")["title"] = "改名後的步驟"
    client.put(f"/api/projects/{pid}/flow", json=flow)
    # 名稱不同就不能用預存結果，會改呼叫 AI（這裡的 AI 替身會失敗 → 502）
    assert client.post(f"/api/projects/{pid}/nodes/lookup/explore").status_code == 502
