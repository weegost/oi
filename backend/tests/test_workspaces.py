"""公司工作區：建立、邀請同事、接受邀請，以及成員共用專案。用示範公司 00000000，不會呼叫官方 API。"""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from tests.test_auth import cleanup_accounts, email, register

DEMO = "00000000"


@pytest.fixture(autouse=True)
def cleanup():
    TestClient(app).get(f"/api/companies/{DEMO}")  # 確保示範公司已存在
    yield
    cleanup_accounts()


def create_workspace(client: TestClient, name: str = "小名團隊") -> dict:
    res = client.post("/api/workspaces", json={"tax_id": DEMO, "name": name, "description": "網路賣 3C"})
    assert res.status_code == 200, res.text
    return res.json()


def invite_and_join(admin: TestClient, member: TestClient, member_name: str, workspace_id: int):
    assert admin.post(f"/api/workspaces/{workspace_id}/invitations", json={"email": email(member_name)}).status_code == 200
    [inv] = member.get("/api/workspaces/invitations/mine").json()
    assert inv["workspace_id"] == workspace_id and inv["invited_by"] == "王小明"
    assert member.post(f"/api/workspaces/invitations/{inv['id']}/accept").status_code == 200


def test_creator_becomes_admin_and_sees_workspace():
    admin = register("ws_admin")
    w = create_workspace(admin)
    assert w["role"] == "ADMIN" and w["member_count"] == 1 and w["company_name"] == "小名 3C 網店"
    assert [x["id"] for x in admin.get("/api/workspaces").json()] == [w["id"]]
    detail = admin.get(f"/api/workspaces/{w['id']}").json()
    assert detail["members"][0]["email"] == email("ws_admin")


def test_workspace_requires_login_and_company_lookup():
    assert TestClient(app).post("/api/workspaces", json={"tax_id": DEMO}).status_code == 401
    admin = register("ws_nolookup")
    res = admin.post("/api/workspaces", json={"tax_id": "99999998"})
    assert res.status_code == 400 and "統一編號" in res.json()["detail"]


def test_name_defaults_to_company_name():
    w = create_workspace(register("ws_default"), name="")
    assert w["name"] == "小名 3C 網店"


def test_invited_member_joins_and_shares_projects():
    admin, member, outsider = register("ws_a"), register("ws_b"), register("ws_c")
    w = create_workspace(admin)
    invite_and_join(admin, member, "ws_b", w["id"])

    assert admin.get(f"/api/workspaces/{w['id']}").json()["member_count"] == 2
    pid = admin.post("/api/projects", json={"workspace_id": w["id"], "name": "退貨改善", "work": "處理退貨"}).json()["id"]
    # 成員看得到、打得開；非成員看不到
    listed = member.get(f"/api/projects?workspace_id={w['id']}").json()
    assert [p["id"] for p in listed] == [pid] and listed[0]["workspace_name"] == "小名團隊"
    assert member.get(f"/api/projects/{pid}").status_code == 200
    assert outsider.get(f"/api/projects/{pid}").status_code == 404
    assert outsider.get(f"/api/workspaces/{w['id']}").status_code == 404


def test_project_in_workspace_uses_workspace_company():
    admin = register("ws_company")
    w = create_workspace(admin)
    p = admin.post("/api/projects", json={"workspace_id": w["id"], "tax_id": "12345678", "name": "x"}).json()
    assert p["tax_id"] == DEMO


def test_non_member_cannot_create_project_in_workspace():
    admin, other = register("ws_owner"), register("ws_stranger")
    w = create_workspace(admin)
    res = other.post("/api/projects", json={"workspace_id": w["id"], "name": "偷建"})
    assert res.status_code == 404


def test_only_admin_can_invite_and_duplicates_are_rejected():
    admin, member = register("ws_boss"), register("ws_staff")
    w = create_workspace(admin)
    invite_and_join(admin, member, "ws_staff", w["id"])

    res = member.post(f"/api/workspaces/{w['id']}/invitations", json={"email": email("ws_new")})
    assert res.status_code == 403
    again = admin.post(f"/api/workspaces/{w['id']}/invitations", json={"email": email("ws_staff")})
    assert again.status_code == 400 and "已經是" in again.json()["detail"]
    admin.post(f"/api/workspaces/{w['id']}/invitations", json={"email": email("ws_new")})
    dup = admin.post(f"/api/workspaces/{w['id']}/invitations", json={"email": email("WS_NEW")})
    assert dup.status_code == 400 and "邀請過" in dup.json()["detail"]


def test_decline_and_revoke():
    admin, invitee = register("ws_host"), register("ws_guest")
    w = create_workspace(admin)
    admin.post(f"/api/workspaces/{w['id']}/invitations", json={"email": email("ws_guest")})
    [inv] = invitee.get("/api/workspaces/invitations/mine").json()
    assert invitee.post(f"/api/workspaces/invitations/{inv['id']}/decline").status_code == 200
    assert invitee.get("/api/workspaces/invitations/mine").json() == []
    assert invitee.get(f"/api/workspaces/{w['id']}").status_code == 404

    created = admin.post(f"/api/workspaces/{w['id']}/invitations", json={"email": email("ws_guest")}).json()
    assert admin.delete(f"/api/workspaces/{w['id']}/invitations/{created['id']}").status_code == 200
    assert invitee.get("/api/workspaces/invitations/mine").json() == []


def test_only_admin_can_delete_workspace_project():
    admin, member, outsider = register("ws_del_admin"), register("ws_del_member"), register("ws_del_out")
    w = create_workspace(admin)
    invite_and_join(admin, member, "ws_del_member", w["id"])
    pid = admin.post("/api/projects", json={"workspace_id": w["id"], "name": "要刪的專案"}).json()["id"]

    assert outsider.delete(f"/api/projects/{pid}").status_code == 404  # 看不到就當作不存在
    res = member.delete(f"/api/projects/{pid}")
    assert res.status_code == 403 and "管理者" in res.json()["detail"]
    assert admin.delete(f"/api/projects/{pid}").status_code == 204
    assert admin.get(f"/api/projects/{pid}").status_code == 404


def test_project_outside_workspace_cannot_be_deleted():
    owner = register("ws_del_solo")
    pid = owner.post("/api/projects", json={"company_name": "測試公司", "name": "個人專案"}).json()["id"]
    assert owner.delete(f"/api/projects/{pid}").status_code == 403


def test_cannot_accept_someone_elses_invitation():
    admin, invitee, sneaky = register("ws_x"), register("ws_y"), register("ws_z")
    w = create_workspace(admin)
    admin.post(f"/api/workspaces/{w['id']}/invitations", json={"email": email("ws_y")})
    [inv] = invitee.get("/api/workspaces/invitations/mine").json()
    assert sneaky.post(f"/api/workspaces/invitations/{inv['id']}/accept").status_code == 404
