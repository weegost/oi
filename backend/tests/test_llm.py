"""Gemini Client 的建立方式。不連網，以假的 Client 取代。"""

import threading
import time
from concurrent.futures import ThreadPoolExecutor

from app import llm


def test_client_is_created_once_when_threads_ask_together(monkeypatch):
    """一次分析全部步驟時多個執行緒同時要 Client；多建的 Client 會被回收而中斷請求，所以只能建一個。"""
    created = []

    class FakeClient:
        def __init__(self, **kw):
            time.sleep(0.05)  # 放大同時建立的時間差
            created.append(self)

    monkeypatch.setattr(llm.genai, "Client", FakeClient)
    monkeypatch.setattr(llm.settings, "gemini_api_key", "test")
    monkeypatch.setattr(llm, "_client", None)

    start = threading.Barrier(8)

    def ask():
        start.wait()
        return llm.get_client()

    with ThreadPoolExecutor(8) as pool:
        clients = list(pool.map(lambda _: ask(), range(8)))
    assert len(created) == 1 and all(c is created[0] for c in clients)
