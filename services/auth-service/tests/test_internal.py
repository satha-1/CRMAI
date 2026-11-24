from sqlalchemy import text

from app.db.session import engine

BASE = "/api/v1/auth"
PASSWORD = "correct-horse-battery"


def scalar(query, **params):
    with engine.connect() as connection:
        return connection.scalar(text(query), params)


def signup(client, email="owner@acme.example"):
    response = client.post(
        f"{BASE}/signup",
        json={"company_name": "Acme", "full_name": "Owner", "email": email, "password": PASSWORD},
    )
    assert response.status_code == 201, response.text
    return response.json()


def account(client, **overrides):
    body = {"email": "New@Acme.example", "full_name": "New Person", "password": PASSWORD, "role": "sales_executive"}
    return client.post("/internal/accounts", json={**body, **overrides})


def test_creates_an_account_with_only_a_password_hash(client):
    response = account(client)
    assert response.status_code == 200, response.text
    assert response.json()["created"] is True
    stored = scalar("SELECT password_hash FROM users WHERE email = 'new@acme.example'")
    assert stored.startswith("$2b$12$")
    assert PASSWORD not in response.text


def test_existing_account_is_returned_and_its_password_is_not_changed(client):
    first = account(client).json()
    before = scalar("SELECT password_hash FROM users")
    second = account(client, password="another-long-password", full_name="Other Name").json()
    assert second == {"id": first["id"], "created": False}
    assert scalar("SELECT password_hash FROM users") == before
    assert scalar("SELECT full_name FROM users") == "New Person"


def test_new_account_needs_a_password_of_ten_characters(client):
    for password in (None, "", "too-short"):
        response = account(client, password=password)
        assert response.status_code == 400
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    assert scalar("SELECT count(*) FROM users") == 0


def test_unknown_role_is_rejected(client):
    assert account(client, role="owner").status_code == 400


def test_person_with_no_active_company_cannot_sign_in_or_refresh(client):
    tokens = signup(client)
    with engine.begin() as connection:
        connection.execute(text("UPDATE memberships SET is_active = false"))
    assert client.post(f"{BASE}/login", json={"email": "owner@acme.example", "password": PASSWORD}).status_code == 401
    assert client.post(f"{BASE}/refresh", json={"refresh_token": tokens["refresh_token"]}).status_code == 401
    me = client.get(f"{BASE}/me", headers={"Authorization": f"Bearer {tokens['access_token']}"})
    assert me.status_code == 401


def test_me_hides_a_company_the_person_was_removed_from(client):
    tokens = signup(client)
    other = signup(client, email="other@acme.example")
    with engine.begin() as connection:
        connection.execute(
            text("INSERT INTO memberships (id, user_id, organization_id, role_id) "
                 "SELECT gen_random_uuid(), :user, m.organization_id, m.role_id FROM memberships m WHERE m.user_id = :other"),
            {"user": tokens["user"]["id"], "other": other["user"]["id"]},
        )
        connection.execute(
            text("UPDATE memberships SET is_active = false WHERE user_id = :user AND organization_id = :org"),
            {"user": tokens["user"]["id"], "org": other["organization_id"]},
        )
    me = client.get(f"{BASE}/me", headers={"Authorization": f"Bearer {tokens['access_token']}"}).json()
    assert [m["organization"]["id"] for m in me["memberships"]] == [tokens["organization_id"]]


def test_me_returns_saved_channel_settings(client):
    tokens = signup(client)
    with engine.begin() as connection:
        connection.execute(
            text("INSERT INTO organization_channels (organization_id, code, is_enabled) VALUES (:org, 'email', true)"),
            {"org": tokens["organization_id"]},
        )
    me = client.get(f"{BASE}/me", headers={"Authorization": f"Bearer {tokens['access_token']}"}).json()
    channels = {c["code"]: c["is_enabled"] for c in me["memberships"][0]["organization"]["channels"]}
    assert channels["email"] is True
    assert channels["website"] is True
    assert channels["voice"] is False
