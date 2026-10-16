"""統編查詢與產業判斷。需要 docker compose 的資料庫；官方 API 以替身取代，不連網。"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.db import engine
from app.main import app
from app.services import gcis, industry

client = TestClient(app)


@pytest.fixture(autouse=True)
def cleanup():
    yield
    with engine.begin() as conn:
        conn.execute(text("delete from companies where tax_id like '9999999%'"))


def item(code, sub=""):
    return {"code": code, "name": "", "category": "", "subcategory": sub}


def test_3c_online_retail_gets_demo_scenario():
    result = industry.classify([item("F213030"), item("F399040")])
    assert result["label"] == "3C／小家電網路零售"
    assert result["demo_scenario"] == "3c_retail"


def test_3c_without_online_is_still_3c():
    result = industry.classify([item("F213010")])
    assert result["is_3c"] and not result["online_retail"]


def test_online_only_is_not_3c():
    result = industry.classify([item("F399040", "其他綜合零售業")])
    assert result["demo_scenario"] is None
    assert result["label"] == "其他綜合零售業"


def test_invalid_tax_id_rejected():
    assert client.get("/api/companies/1234").status_code == 400
    assert client.get("/api/companies/abcdefgh").status_code == 400


def test_demo_code_never_calls_official_api(monkeypatch):
    async def fail(_):
        raise AssertionError("案例代碼不可送往官方 API")

    monkeypatch.setattr(gcis, "lookup", fail)
    r = client.get("/api/companies/00000000?refresh=true")
    assert r.status_code == 200
    assert r.json()["registration_type"] == "demo"
    assert r.json()["industry"]["demo_scenario"] == "3c_retail"


def test_unknown_tax_id_returns_404(monkeypatch):
    async def none(_):
        return None

    monkeypatch.setattr(gcis, "lookup", none)
    assert client.get("/api/companies/99999991?refresh=true").status_code == 404


def test_official_api_down_falls_back_to_cache(monkeypatch):
    async def ok(_):
        return {**DEMO_LIKE, "name": "快取測試公司"}

    async def down(_):
        raise gcis.GcisError("逾時")

    monkeypatch.setattr(gcis, "lookup", ok)
    client.get("/api/companies/99999992?refresh=true")
    monkeypatch.setattr(gcis, "lookup", down)
    r = client.get("/api/companies/99999992?refresh=true")
    assert r.status_code == 200 and r.json()["name"] == "快取測試公司"


DEMO_LIKE = {
    "registration_type": "company",
    "name": "",
    "owner": "",
    "address": "",
    "status": "核准設立",
    "capital": "",
    "setup_date": "",
    "business_items": [item("F213030")],
    "raw": {},
}
