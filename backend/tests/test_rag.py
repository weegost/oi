"""企業文件 RAG：解析、切段、上傳 API、向量檢索與關鍵字備援，以及 Agent／AI 探索引用文件。
Gemini 向量化以「字元出現與否」的假向量取代：共用越多字的段落越相近。"""

import io
import zlib

import pytest
from docx import Document as Docx
from fastapi.testclient import TestClient
from sqlalchemy import delete, text

from app import agent, allocation, llm, rag
from app.db import SessionLocal
from app.main import app
from app.models import EMBED_DIM, Company, Document

client = TestClient(app)
TAX_ID = "99999901"

POLICY = """# 退貨政策
## 一、七天鑑賞期
收到商品隔天起算七天內可申請退貨。
## 二、安全問題
商品過熱、冒煙時請停止使用，一律轉交主管處理。
## 三、退款
退款金額超過 5000 元須主管核准。"""


def fake_embed(texts, task, dim):
    vectors = []
    for t in texts:
        v = [0.0] * dim
        for ch in set(t):
            v[zlib.crc32(ch.encode()) % dim] = 1.0
        vectors.append(v)
    return vectors


@pytest.fixture(autouse=True)
def company():
    with SessionLocal() as db:
        db.merge(Company(tax_id=TAX_ID, name="測試企業", registration_type="demo"))
        db.commit()
    yield
    with SessionLocal() as db:
        db.execute(text("delete from projects where tax_id = :t"), {"t": TAX_ID})
        db.execute(delete(Document).where(Document.tax_id == TAX_ID))
        db.execute(delete(Company).where(Company.tax_id == TAX_ID))
        db.commit()


@pytest.fixture
def vectors(monkeypatch):
    monkeypatch.setattr(llm, "embed", fake_embed)
    monkeypatch.setattr(rag, "MIN_SCORE", 0.3)  # 假向量的分數分布與 Gemini 不同


def upload(filename, data: bytes, kind="政策"):
    return client.post(f"/api/companies/{TAX_ID}/documents", files={"file": (filename, data)}, data={"kind": kind})


def test_chunks_follow_headings():
    chunks = rag.chunk_text(POLICY)
    assert len(chunks) == 3
    assert chunks[0].startswith("# 退貨政策\n## 一、七天鑑賞期")  # 只有標題的段落併入下一段
    assert "冒煙" in chunks[1] and "冒煙" not in chunks[0]


def test_long_paragraph_is_split_under_size():
    chunks = rag.chunk_text("退貨規定。" * 200, size=100)
    assert len(chunks) > 1 and all(len(c) <= 100 for c in chunks)


def test_extract_text_from_docx_and_big5():
    buf = io.BytesIO()
    d = Docx()
    d.add_paragraph("客服每天檢查訊息")
    d.add_table(rows=1, cols=2).rows[0].cells[0].text = "訂單編號"
    d.save(buf)
    assert "客服每天檢查訊息" in rag.extract_text("sop.docx", buf.getvalue())
    assert "訂單編號" in rag.extract_text("sop.docx", buf.getvalue())
    assert rag.extract_text("faq.txt", "退貨".encode("cp950")) == "退貨"


def test_upload_rejects_unsupported_file():
    r = upload("photo.jpg", b"\xff\xd8")
    assert r.status_code == 400 and "支援" in r.json()["detail"]


def test_upload_and_vector_search(vectors):
    r = upload("退貨政策.md", POLICY.encode())
    assert r.status_code == 200
    doc = r.json()[0]
    assert doc["chunks"] == 3 and doc["embedded"] is True

    hits = client.get(f"/api/companies/{TAX_ID}/documents/search", params={"q": "商品冒煙過熱怎麼辦"}).json()
    assert hits[0]["filename"] == "退貨政策.md" and "冒煙" in hits[0]["text"]


def test_same_filename_replaces_old_version(vectors):
    upload("退貨政策.md", POLICY.encode())
    docs = upload("退貨政策.md", "# 新版\n只有一段".encode()).json()
    assert len(docs) == 1 and docs[0]["chunks"] == 1


def test_keyword_fallback_when_embedding_unavailable():
    doc = upload("退貨政策.md", POLICY.encode()).json()[0]
    assert doc["embedded"] is False  # conftest 讓向量化失敗
    hits = client.get(f"/api/companies/{TAX_ID}/documents/search", params={"q": "退款金額主管核准"}).json()
    assert hits and "5000" in hits[0]["text"]


def test_unrelated_query_returns_nothing():
    upload("退貨政策.md", POLICY.encode())
    assert client.get(f"/api/companies/{TAX_ID}/documents/search", params={"q": "午餐便當"}).json() == []


def test_delete_document():
    doc = upload("退貨政策.md", POLICY.encode()).json()[0]
    assert client.delete(f"/api/companies/{TAX_ID}/documents/{doc['id']}").json() == []


def test_agent_puts_documents_in_prompt_and_returns_sources(monkeypatch):
    upload("退貨政策.md", POLICY.encode())
    project = client.post("/api/projects", json={"tax_id": TAX_ID, "name": "退貨", "work": "處理退貨"}).json()
    prompts = []

    def fake_update(prompt, schema, system=None):
        prompts.append(prompt)
        return agent.FlowUpdate(nodes=[], edges=[], summary="已更新")

    monkeypatch.setattr(llm, "generate_json", fake_update)
    r = client.post(f"/api/projects/{project['id']}/chat", json={"mode": "direct", "message": "客人說商品冒煙要退款"})
    assert r.status_code == 200
    assert "企業提供的文件" in prompts[0] and "冒煙" in prompts[0]
    sources = r.json()["messages"][-1]["sources"]
    assert sources and sources[0]["filename"] == "退貨政策.md"


def test_exploration_cites_documents(monkeypatch):
    upload("退貨政策.md", POLICY.encode())
    flow = {
        "nodes": [
            {"id": "s", "kind": "start", "title": "開始"},
            {"id": "r", "kind": "process", "title": "執行退款", "condition": "退款金額超過 5000 元"},
            {"id": "e", "kind": "end", "title": "結束"},
        ],
        "edges": [{"source": "s", "target": "r"}, {"source": "r", "target": "e"}],
    }
    project = client.post("/api/projects", json={"tax_id": TAX_ID, "name": "退款"}).json()
    client.put(f"/api/projects/{project['id']}/flow", json=flow)
    prompts = []

    def fake_explore(prompt, schema, system=None):
        prompts.append(prompt)
        return allocation.Exploration(ai_tasks=["核對金額"], goal="加快退款", options=[], recommended="review")

    monkeypatch.setattr(llm, "generate_json", fake_explore)
    r = client.post(f"/api/projects/{project['id']}/nodes/r/explore").json()
    assert "主管核准" in prompts[0]
    assert r["allocations"]["r"]["sources"][0]["filename"] == "退貨政策.md"


def test_embed_dimension_matches_column():
    assert len(fake_embed(["測試"], "RETRIEVAL_QUERY", EMBED_DIM)[0]) == EMBED_DIM


def test_off_topic_chat_cites_no_documents(monkeypatch):
    """專案主題不能混進檢索，否則問早餐也會引用退貨文件。"""
    upload("退貨政策.md", POLICY.encode())
    project = client.post("/api/projects", json={"tax_id": TAX_ID, "name": "退貨", "work": "處理退貨退款"}).json()
    monkeypatch.setattr(llm, "generate_json", lambda prompt, schema, system=None: agent.FlowUpdate(nodes=[], edges=[], summary="與流程無關"))
    r = client.post(f"/api/projects/{project['id']}/chat", json={"mode": "direct", "message": "我的早餐要吃甚麼"})
    assert r.json()["messages"][-1]["sources"] == []
