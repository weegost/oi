"""帳號：註冊、登入、登出，「我的專案」列表，以及帳號專案的存取限制。"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.auth import hash_password, verify_password
from app.db import engine
from app.main import app

PREFIX = "pytest_"


@pytest.fixture(autouse=True)
def cleanup():
    yield
    with engine.begin() as conn:
        ids = [r[0] for r in conn.execute(text("select id from accounts where username like :p"), {"p": PREFIX + "%"})]
        if ids:
            rows = conn.execute(text("select id, tax_id from projects where account_id = any(:ids)"), {"ids": ids}).all()
            conn.execute(text("delete from projects where account_id = any(:ids)"), {"ids": ids})
            for _, tax_id in rows:
                conn.execute(text("delete from companies where tax_id = :t and registration_type = 'manual'"), {"t": tax_id})
            conn.execute(text("delete from accounts where id = any(:ids)"), {"ids": ids})


def register(name: str, password: str = "secret123", display: str = "測試公司") -> TestClient:
    client = TestClient(app)
    res = client.post("/api/auth/register", json={"username": PREFIX + name, "password": password, "display_name": display})
    assert res.status_code == 200, res.text
    return client


def new_project(client: TestClient, name: str = "退貨改善") -> int:
    return client.post("/api/projects", json={"company_name": "測試公司", "name": name, "work": "處理退貨"}).json()["id"]


def test_password_is_hashed_and_verifiable():
    stored = hash_password("abc12345")
    assert "abc12345" not in stored
    assert verify_password("abc12345", stored) and not verify_password("wrong", stored)


def test_register_logs_in_and_me_returns_account():
    client = register("alice", display="阿明電器行")
    me = client.get("/api/auth/me").json()
    assert me["username"] == PREFIX + "alice" and me["display_name"] == "阿明電器行"


def test_duplicate_username_and_short_password_are_rejected():
    register("bob")
    dup = TestClient(app).post("/api/auth/register", json={"username": PREFIX + "bob", "password": "secret123"})
    assert dup.status_code == 400 and "已經有人使用" in dup.json()["detail"]
    short = TestClient(app).post("/api/auth/register", json={"username": PREFIX + "carol", "password": "123"})
    assert short.status_code == 400


def test_login_logout_flow():
    register("dave")
    client = TestClient(app)
    assert client.post("/api/auth/login", json={"username": PREFIX + "dave", "password": "bad"}).status_code == 400
    assert client.post("/api/auth/login", json={"username": PREFIX + "dave", "password": "secret123"}).status_code == 200
    assert client.get("/api/auth/me").json()["username"] == PREFIX + "dave"
    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").json() is None


def test_my_projects_lists_only_my_projects():
    a, b = register("erin"), register("frank")
    mine = new_project(a, "A 的專案")
    new_project(b, "B 的專案")
    listed = a.get("/api/projects").json()
    assert [p["id"] for p in listed] == [mine]
    assert listed[0]["company_name"] == "測試公司" and listed[0]["progress"] == 0


def test_project_list_requires_login():
    assert TestClient(app).get("/api/projects").status_code == 401


def test_other_accounts_cannot_open_my_project():
    owner, other = register("gina"), register("hank")
    pid = new_project(owner)
    assert owner.get(f"/api/projects/{pid}").status_code == 200
    assert owner.get(f"/api/projects/{pid}/report/markdown").status_code == 200  # 下載連結靠 cookie 也能通過
    for client in (other, TestClient(app)):
        assert client.get(f"/api/projects/{pid}").status_code == 404
        assert client.get(f"/api/projects/{pid}/sandbox").status_code == 404
        assert client.get(f"/api/projects/{pid}/report").status_code == 404


def test_anonymous_project_still_works_without_login():
    client = TestClient(app)
    res = client.post("/api/projects", json={"name": "未登入專案", "work": "處理退貨"}).json()
    try:
        assert client.get(f"/api/projects/{res['id']}").status_code == 200
    finally:
        with engine.begin() as conn:
            conn.execute(text("delete from projects where id = :i"), {"i": res["id"]})
            conn.execute(text("delete from companies where tax_id = :t"), {"t": res["tax_id"]})
