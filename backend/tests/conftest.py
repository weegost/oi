import pytest

from app import demo_full, llm


@pytest.fixture(autouse=True)
def no_baked_demo(monkeypatch):
    """預設不使用預存的示範分析，讓測試以 AI 替身控制結果；test_demo_full 會自行換成假的預存資料。"""
    monkeypatch.setattr(demo_full, "load_baked", lambda: {"explorations": {}, "summary": None})


@pytest.fixture(autouse=True)
def no_embedding(monkeypatch):
    """測試不呼叫 Gemini 向量化；文件檢索會自動改用關鍵字比對。test_rag 會換成假的向量。"""

    def unavailable(*args, **kwargs):
        raise llm.LLMNotConfigured("測試不使用 Gemini")

    monkeypatch.setattr(llm, "embed", unavailable)
