import secrets

import jwt
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.api.deps import get_db
from app.core.security import hash_password
from app.db.session import SessionLocal, engine
from app.main import app
from app.models import Membership, Organization, User
from app.repositories import user_repository

BASE = "/api/v1/auth"
PASSWORD = "correct-horse-battery"
READ = {"customer.read", "lead.read", "followup.read", "conversation.read", "notification.read"}

# Written out by hand so a wrong migration fails here. Must match frontend/src/auth/permissions.ts.
EXPECTED_PERMISSIONS = {
    "admin": {"user.manage", "org.manage", "notification.read"},
    "marketing_manager": READ
    | {
        "customer.write", "lead.write", "lead.delete", "lead.assign.marketing", "call.log", "followup.write",
        "conversation.reply", "conversation.takeover", "escalation.read", "escalation.assign", "knowledge.read",
        "knowledge.write", "knowledge.publish", "analytics.read", "team.performance", "audit.read",
    },
    "marketing_executive": READ | {"customer.write", "lead.write", "call.log", "followup.write"},
    "sales_manager": READ
    | {
        "lead.write", "lead.assign.sales", "visit.assign", "visit.manage", "analytics.read", "team.performance",
        "audit.read",
    },
    "sales_executive": READ | {"lead.write", "visit.manage"},
}


def create_user(role_name):
    email = f"{role_name.replace('_', '.')}@acme.example"
    with SessionLocal() as db:
        role = user_repository.get_role(db, role_name)
        organization = Organization(name="Acme", industry="Retail", widget_key=f"wk_{secrets.token_urlsafe(24)}")
        user = User(email=email, password_hash=hash_password(PASSWORD), full_name=role_name, role=role)
        db.add_all([organization, user, Membership(user=user, organization=organization, role=role)])
        db.commit()
    return email


def login(client, email, password=PASSWORD):
    return client.post(f"{BASE}/login", json={"email": email, "password": password})


def scalar(query, **params):
    with engine.connect() as connection:
        return connection.scalar(text(query), params)


def test_database_has_every_role():
    assert scalar("SELECT count(*) FROM roles") == len(EXPECTED_PERMISSIONS)


@pytest.mark.parametrize("role", EXPECTED_PERMISSIONS)
def test_each_role_logs_in_and_gets_its_exact_permissions(client, role):
    email = create_user(role)

    response = login(client, email)
    assert response.status_code == 200, response.text
    tokens = response.json()
    assert tokens["user"]["role"] == role
    assert jwt.decode(tokens["access_token"], options={"verify_signature": False})["role"] == role

    me = client.get(f"{BASE}/me", headers={"Authorization": f"Bearer {tokens['access_token']}"}).json()
    assert me["email"] == email
    assert me["role"] == role
    assert set(me["permissions"]) == EXPECTED_PERMISSIONS[role]
    assert [m["role"] for m in me["memberships"]] == [role]


@pytest.mark.parametrize("role", EXPECTED_PERMISSIONS)
def test_each_role_is_rejected_with_a_wrong_password(client, role):
    response = login(client, create_user(role), "wrong-password")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "AUTH_INVALID"
    assert scalar("SELECT count(*) FROM refresh_tokens") == 0


def test_only_admin_can_manage_users():
    assert [role for role, granted in EXPECTED_PERMISSIONS.items() if "user.manage" in granted] == ["admin"]


def test_a_role_change_in_the_database_applies_right_away(client):
    tokens = login(client, create_user("sales_executive")).json()
    with engine.begin() as connection:
        connection.execute(text("UPDATE users SET role_id = (SELECT id FROM roles WHERE name = 'sales_manager')"))
    me = client.get(f"{BASE}/me", headers={"Authorization": f"Bearer {tokens['access_token']}"}).json()
    assert me["role"] == "sales_manager"
    assert "visit.assign" in me["permissions"]


def test_signup_writes_every_row_to_the_database(client):
    response = client.post(
        f"{BASE}/signup",
        json={"company_name": "Blue Beach", "industry": "Retail", "full_name": "Owner", "email": "Owner@Beach.example", "password": PASSWORD},
    )
    assert response.status_code == 201, response.text
    body = response.json()

    stored_hash = scalar("SELECT password_hash FROM users WHERE email = 'owner@beach.example'")
    assert stored_hash.startswith("$2b$12$")
    assert PASSWORD not in stored_hash
    assert scalar("SELECT name FROM organizations WHERE id = :id", id=body["organization_id"]) == "Blue Beach"
    assert (
        scalar(
            "SELECT r.name FROM memberships m JOIN roles r ON r.id = m.role_id "
            "WHERE m.user_id = :user AND m.organization_id = :org",
            user=body["user"]["id"],
            org=body["organization_id"],
        )
        == "admin"
    )
    assert scalar("SELECT count(*) FROM refresh_tokens WHERE user_id = :user", user=body["user"]["id"]) == 1


def test_data_saved_by_signup_comes_back_through_login(client):
    client.post(
        f"{BASE}/signup",
        json={"company_name": "Blue Beach", "full_name": "Owner", "email": "owner@beach.example", "password": PASSWORD},
    )
    tokens = login(client, "owner@beach.example").json()
    me = client.get(f"{BASE}/me", headers={"Authorization": f"Bearer {tokens['access_token']}"}).json()
    assert me["full_name"] == "Owner"
    assert me["memberships"][0]["organization"]["name"] == "Blue Beach"


def test_unreachable_database_returns_a_clean_error_and_no_connection_details(client):
    broken = create_engine("postgresql+psycopg://crmai:secret-pw@127.0.0.1:1/crmai", connect_args={"connect_timeout": 2})

    def broken_db():
        with sessionmaker(broken)() as db:
            yield db

    app.dependency_overrides[get_db] = broken_db
    try:
        for response in (client.get(f"{BASE}/health"), login(client, "owner@acme.example")):
            assert response.status_code == 500
            assert response.json()["error"]["code"] == "INTERNAL"
            assert "secret-pw" not in response.text
            assert "127.0.0.1" not in response.text
    finally:
        app.dependency_overrides.clear()
