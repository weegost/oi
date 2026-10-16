import pytest

from app import demo_full


@pytest.fixture(autouse=True)
def no_baked_demo(monkeypatch):
    """預設不使用預存的示範分析，讓測試以 AI 替身控制結果；test_demo_full 會自行換成假的預存資料。"""
    monkeypatch.setattr(demo_full, "load_baked", lambda: {"explorations": {}, "summary": None})
