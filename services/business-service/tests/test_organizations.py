import pytest
from sqlalchemy import text

from app.db.session import engine
from tests.conftest import insert_company, insert_membership, insert_user, token_for

CURRENT = "/api/v1/organizations/current"


@pytest.fixture
def org(client):
    with engine.begin() as connection:
        org_id = insert_company(connection)
        admin = insert_user(connection, "admin@acme.example", "admin")
        insert_membership(connection, admin, org_id, "admin")
        member = insert_user(connection, "exec@acme.example", "sales_executive")
        insert_membership(connection, member, org_id, "sales_executive")

    def headers(user_id=admin):
        return {"Authorization": f"Bearer {token_for(user_id)}", "X-Organization-Id": str(org_id)}

    return {"id": org_id, "admin": admin, "member": member, "headers": headers}


def channels_of(body):
    return {c["code"]: c["is_enabled"] for c in body["channels"]}


def test_read_current_company(client, org):
    response = client.get(CURRENT, headers=org["headers"]())
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == str(org["id"])
    assert channels_of(body) == {
        "website": True, "email": False, "whatsapp": False, "facebook": False, "instagram": False, "voice": False,
    }


def test_every_member_can_read_it(client, org):
    assert client.get(CURRENT, headers=org["headers"](org["member"])).status_code == 200


def test_update_profile_saves_to_the_database(client, org):
    body = {"name": "Blue Beach", "industry": "Hospitality", "timezone": "Asia/Colombo", "product_label": "room"}
    response = client.patch(CURRENT, json=body, headers=org["headers"]())
    assert response.status_code == 200, response.text
    with engine.connect() as connection:
        row = connection.execute(
            text("SELECT name, industry, timezone, product_label FROM organizations WHERE id = :o"), {"o": org["id"]}
        ).one()
    assert tuple(row) == ("Blue Beach", "Hospitality", "Asia/Colombo", "room")


def test_update_only_changes_what_was_sent(client, org):
    response = client.patch(CURRENT, json={"product_label": "course"}, headers=org["headers"]())
    assert response.json()["name"] == "Acme"
    assert response.json()["product_label"] == "course"


@pytest.mark.parametrize("body", [{"name": "x"}, {"name": None}, {"timezone": "bad zone!"}, {"product_label": ""}, {"channels": [{"code": "fax", "is_enabled": True}]}])
def test_update_validation(client, org, body):
    assert client.patch(CURRENT, json=body, headers=org["headers"]()).status_code == 400


def test_plan_and_widget_key_cannot_be_set_directly(client, org):
    before = client.get(CURRENT, headers=org["headers"]()).json()
    after = client.patch(CURRENT, json={"plan": "growth", "widget_key": "wk_mine", "id": "x"}, headers=org["headers"]()).json()
    assert (after["plan"], after["widget_key"], after["id"]) == (before["plan"], before["widget_key"], before["id"])


def test_turn_a_channel_on_and_off(client, org):
    headers = org["headers"]()
    current = client.get(CURRENT, headers=headers).json()["channels"]
    on = [{**c, "is_enabled": True} if c["code"] == "email" else c for c in current]
    assert channels_of(client.patch(CURRENT, json={"channels": on}, headers=headers).json())["email"] is True
    with engine.connect() as connection:
        assert connection.scalar(text("SELECT is_enabled FROM organization_channels WHERE code = 'email'")) is True
    assert channels_of(client.get(CURRENT, headers=headers).json())["email"] is True
    off = [{**c, "is_enabled": False} if c["code"] == "email" else c for c in on]
    assert channels_of(client.patch(CURRENT, json={"channels": off}, headers=headers).json())["email"] is False


def test_channel_without_a_transport_cannot_be_turned_on(client, org):
    response = client.patch(CURRENT, json={"channels": [{"code": "whatsapp", "is_enabled": True}]}, headers=org["headers"]())
    assert response.status_code == 400
    assert "not available" in response.json()["error"]["message"]


def test_rotate_widget_key_saves_a_new_key(client, org):
    headers = org["headers"]()
    old = client.get(CURRENT, headers=headers).json()["widget_key"]
    response = client.post(f"{CURRENT}/rotate-widget-key", headers=headers)
    assert response.status_code == 200
    new = response.json()["widget_key"]
    assert new != old and new.startswith("wk_")
    with engine.connect() as connection:
        assert connection.scalar(text("SELECT widget_key FROM organizations WHERE id = :o"), {"o": org["id"]}) == new


def test_non_admin_cannot_change_the_company(client, org):
    headers = org["headers"](org["member"])
    assert client.patch(CURRENT, json={"name": "Taken"}, headers=headers).status_code == 403
    assert client.post(f"{CURRENT}/rotate-widget-key", headers=headers).status_code == 403


def test_one_company_cannot_change_another(client, org):
    with engine.begin() as connection:
        other = insert_company(connection, "Other")
    headers = {**org["headers"](), "X-Organization-Id": str(other)}
    assert client.patch(CURRENT, json={"name": "Taken"}, headers=headers).status_code == 403
    with engine.connect() as connection:
        assert connection.scalar(text("SELECT name FROM organizations WHERE id = :o"), {"o": other}) == "Other"


def test_create_workspace_makes_you_its_admin(client, org):
    headers = {"Authorization": f"Bearer {token_for(org['member'])}"}
    response = client.post("/api/v1/organizations", json={"name": "Side Business", "industry": "Retail"}, headers=headers)
    assert response.status_code == 201, response.text
    new = response.json()
    assert new["widget_key"].startswith("wk_")
    with engine.connect() as connection:
        role = connection.scalar(
            text("SELECT r.name FROM memberships m JOIN roles r ON r.id = m.role_id WHERE m.user_id = :u AND m.organization_id = :o"),
            {"u": org["member"], "o": new["id"]},
        )
    assert role == "admin"
    assert client.patch(CURRENT, json={"product_label": "plan"}, headers={**headers, "X-Organization-Id": new["id"]}).status_code == 200


def test_create_workspace_needs_a_token_and_a_name(client, org):
    assert client.post("/api/v1/organizations", json={"name": "No Token"}).status_code == 401
    headers = {"Authorization": f"Bearer {token_for(org['admin'])}"}
    assert client.post("/api/v1/organizations", json={"name": "x"}, headers=headers).status_code == 400
