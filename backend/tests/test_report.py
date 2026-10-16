"""需求草案：彙整內容、待確認事項、匯出檔案。Gemini 以替身取代。"""

import io
from urllib.parse import unquote

import pytest
from docx import Document
from fastapi.testclient import TestClient
from sqlalchemy import text

from app import llm
from app.allocation import Exploration, ModeOption
from app.db import engine
from app.main import app
from app.sandbox.engine import CONDITIONS

client = TestClient(app)


@pytest.fixture(autouse=True)
def cleanup():
    with engine.connect() as conn:
        last = conn.execute(text("select coalesce(max(id), 0) from projects")).scalar()
    yield
    with engine.begin() as conn:
        conn.execute(text("delete from projects where id > :last"), {"last": last})


def exploration(**kw):
    def opt(mode):
        return ModeOption(
            mode=mode, ai_does=f"{mode}-AI", human_does=f"{mode}-人", required_data=["訂單編號"],
            permissions=["讀取訂單"], handoff=["查無訂單時轉客服"], risk="r", fit="可行", reason="",
        )

    return Exploration(ai_tasks=["比對訂單"], goal="縮短查詢時間", options=[opt(m) for m in ("human", "assist", "review", "auto")], recommended="assist")


@pytest.fixture
def project(monkeypatch):
    monkeypatch.setattr(llm, "generate_json", lambda *a, **k: exploration())
    client.get("/api/companies/00000000")
    pid = client.post("/api/projects/demo").json()["id"]
    client.post(f"/api/projects/{pid}/nodes/lookup/explore")
    client.put(f"/api/projects/{pid}/allocations/lookup", json={"mode": "assist"})
    return pid


def report(pid):
    return client.get(f"/api/projects/{pid}/report").json()


def test_report_uses_chosen_mode_details(project):
    r = report(project)
    lookup = next(a for a in r["allocations"] if a["step"] == "查詢訂單資料")
    assert lookup["mode"] == "AI 輔助" and lookup["ai_does"] == "assist-AI"
    assert "訂單編號" in r["data"]
    assert any("讀取訂單" in p for p in r["permissions"])


def test_untested_project_lists_todo(project):
    todo = report(project)["todo"]
    assert "尚未執行情境沙盒測試。" in todo
    assert any("尚未由企業確認" in t for t in todo)


def test_assumed_conditions_and_gaps_become_todo(project):
    client.post(f"/api/projects/{project}/sandbox/run", json={"config": {"docs_ready": True}})
    r = report(project)
    assert r["testing"]["tested"] and not r["testing"]["stale"]
    assert any("假設「已提供 SOP" in t for t in r["todo"])
    assert any(t.startswith("[") for t in r["todo"])  # 缺口也列入待確認


def test_changing_allocation_marks_test_stale(project):
    client.post(f"/api/projects/{project}/sandbox/run", json={"config": {k: True for k in CONDITIONS}})
    client.put(f"/api/projects/{project}/allocations/notify", json={"mode": "auto"})
    r = report(project)
    assert r["testing"]["stale"]
    assert any("重新執行情境測試" in t for t in r["todo"])


def test_markdown_download(project):
    res = client.get(f"/api/projects/{project}/report/markdown")
    assert res.status_code == 200
    assert "AI 導入需求草案" in unquote(res.headers["content-disposition"])
    body = res.content.decode("utf-8")
    assert "## 9. 尚待確認事項" in body and "查詢訂單資料" in body


def test_docx_download_opens_in_word(project):
    res = client.get(f"/api/projects/{project}/report/docx")
    doc = Document(io.BytesIO(res.content))
    texts = [p.text for p in doc.paragraphs]
    assert any("AI 導入需求草案" in t for t in texts)
    assert doc.tables and doc.tables[0].rows[0].cells[1].text == "步驟"


def test_ai_summary_is_saved_and_shown(project, monkeypatch):
    monkeypatch.setattr(llm, "generate", lambda prompt, system=None: ("這是摘要。", "fake"))
    r = client.post(f"/api/projects/{project}/report/summary").json()
    assert r["ai_summary"] == "這是摘要。"
    assert "AI 撰寫" in client.get(f"/api/projects/{project}/report/markdown").content.decode()
