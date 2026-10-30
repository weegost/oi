"""帳號：Email 註冊、登入、登出，「我的專案」列表，以及帳號專案的存取限制。"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.auth import hash_password, verify_password
from app.db import engine
from app.main import app

PREFIX = "pytest_"
PASSWORD = "secret123"


def email(name: str) -> str:
    return f"{PREFIX}{name}@example.test"


def cleanup_accounts():
    """刪除測試帳號，以及它們建立的工作區、專案與自填公司。"""
    with engine.begin() as conn:
        ids = [r[0] for r in conn.execute(text("select id from accounts where username like :p"), {"p": PREFIX + "%"})]
        if not ids:
            return
        conn.execute(text("delete from workspaces where created_by = any(:ids)"), {"ids": ids})
        rows = conn.execute(text("select id, tax_id from projects where account_id = any(:ids)"), {"ids": ids}).all()
        conn.execute(text("delete from projects where account_id = any(:ids)"), {"ids": ids})
        for _, tax_id in rows:
            conn.execute(text("delete from companies where tax_id = :t and registration_type = 'manual'"), {"t": tax_id})
        conn.execute(text("delete from workspace_invitations where email like :p"), {"p": PREFIX + "%"})
        conn.execute(text("delete from accounts where id = any(:ids)"), {"ids": ids})


@pytest.fixture(autouse=True)
def cleanup():
    yield
    cleanup_accounts()


def register(name: str, display: str = "王小明") -> TestClient:
    client = TestClient(app)
    res = client.post("/api/auth/register", json={"email": email(name), "password": PASSWORD, "display_name": display})
    assert res.status_code == 200, res.text
    return client


def new_project(client: TestClient, name: str = "退貨改善") -> int:
    return client.post("/api/projects", json={"company_name": "測試公司", "name": name, "work": "處理退貨"}).json()["id"]


def test_password_is_hashed_and_verifiable():
    stored = hash_password("abc12345")
    assert "abc12345" not in stored
    assert verify_password("abc12345", stored) and not verify_password("wrong", stored)


def test_register_logs_in_and_me_returns_account():
    client = register("alice", display="陳阿明")
    me = client.get("/api/auth/me").json()
    assert me["username"] == email("alice") and me["display_name"] == "陳阿明"


def test_email_is_stored_lowercase():
    client = TestClient(app)
    res = client.post(
        "/api/auth/register",
        json={"email": email("Upper").upper(), "password": PASSWORD, "display_name": "大寫"},
    )
    assert res.status_code == 200 and res.json()["username"] == email("upper")


def test_bad_registration_is_rejected():
    register("bob")
    cases = [
        ({"email": email("bob"), "password": PASSWORD, "display_name": "重複"}, "已經註冊過"),
        ({"email": "not-an-email", "password": PASSWORD, "display_name": "格式"}, "電子郵件"),
        ({"email": email("carol"), "password": "1234567", "display_name": "太短"}, "至少 8"),
        ({"email": email("dan"), "password": PASSWORD, "display_name": " "}, "顯示姓名"),
    ]
    for body, message in cases:
        res = TestClient(app).post("/api/auth/register", json=body)
        assert res.status_code == 400 and message in res.json()["detail"], body


def test_login_logout_flow():
    register("dave")
    client = TestClient(app)
    assert client.post("/api/auth/login", json={"username": email("dave"), "password": "bad"}).status_code == 400
    # Email 大小寫不同也能登入
    assert client.post("/api/auth/login", json={"username": email("DAVE"), "password": PASSWORD}).status_code == 200
    assert client.get("/api/auth/me").json()["username"] == email("dave")
    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").json() is None


def test_old_company_account_can_still_log_in():
    """舊版「一家公司共用一個帳號」的帳號名稱不是 Email，仍要能登入。"""
    with engine.begin() as conn:
        conn.execute(
            text("insert into accounts (username, password_hash, display_name) values (:u, :h, '舊公司')"),
            {"u": PREFIX + "oldshop", "h": hash_password(PASSWORD)},
        )
    client = TestClient(app)
    assert client.post("/api/auth/login", json={"username": PREFIX + "oldshop", "password": PASSWORD}).status_code == 200


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
