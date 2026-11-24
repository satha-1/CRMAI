import urllib.error
import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.api.deps import get_db
from app.db.session import engine
from app.main import app
from app.services import auth_client
from tests.conftest import ISSUER, insert_company, insert_membership, insert_user, token_for

STAFF = {"full_name": "Sathsara", "email": "Sathsara@Acme.example", "password": "temporary-pass", "role": "marketing_manager"}


class Company:
    """A company with an admin, plus helpers to call the API as any member."""

    def __init__(self, client, name="Acme"):
        self.client = client
        with engine.begin() as connection:
            self.id = insert_company(connection, name)
            self.admin = insert_user(connection, f"admin.{uuid.uuid4().hex[:6]}@{name.lower()}.example", "admin")
            insert_membership(connection, self.admin, self.id, "admin")

    def add_member(self, role, manager_id=None):
        with engine.begin() as connection:
            user_id = insert_user(connection, f"{role}.{uuid.uuid4().hex[:6]}@acme.example", role)
            insert_membership(connection, user_id, self.id, role, manager_id)
        return user_id

    def headers(self, user_id=None):
        return {"Authorization": f"Bearer {token_for(user_id or self.admin)}", "X-Organization-Id": str(self.id)}

    def add(self, as_user=None, **overrides):
        return self.client.post("/api/v1/users", json={**STAFF, **overrides}, headers=self.headers(as_user))

    def patch(self, target, as_user=None, **body):
        return self.client.patch(f"/api/v1/users/{target}", json=body, headers=self.headers(as_user))

    def staff(self, as_user=None):
        return self.client.get("/api/v1/users", headers=self.headers(as_user))


@pytest.fixture
def company(client):
    return Company(client)


def error_code(response):
    return response.json()["error"]["code"]


def row(query, **params):
    with engine.connect() as connection:
        return connection.execute(text(query), params).first()


def test_add_staff_saves_to_the_database_and_shows_in_the_list(company, accounts):
    response = company.add()
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["email"] == "sathsara@acme.example"
    assert body["role"] == "marketing_manager"
    assert body["is_active"] is True
    assert body["manager_id"] is None
    assert "password" not in response.text

    stored = row(
        "SELECT r.name, m.is_active FROM memberships m JOIN roles r ON r.id = m.role_id "
        "WHERE m.user_id = :user AND m.organization_id = :org", user=body["id"], org=company.id,
    )
    assert tuple(stored) == ("marketing_manager", True)
    listed = company.staff().json()
    assert listed["next_cursor"] is None
    assert body["id"] in [person["id"] for person in listed["items"]]


def test_add_staff_passes_the_password_only_to_auth_service(company, accounts):
    company.add()
    assert accounts == [{"email": "sathsara@acme.example", "full_name": "Sathsara", "password": "temporary-pass", "role": "marketing_manager"}]


def test_list_shows_people_from_this_company_only(client, company, accounts):
    other = Company(client, "Other")
    other_member = other.add_member("sales_executive")
    assert str(other_member) not in [p["id"] for p in company.staff().json()["items"]]


def test_every_member_can_read_the_list(company):
    executive = company.add_member("sales_executive")
    assert company.staff(executive).status_code == 200


@pytest.mark.parametrize("role", ["marketing_manager", "marketing_executive", "sales_manager", "sales_executive"])
def test_only_admins_can_change_staff(company, accounts, role):
    member = company.add_member(role)
    assert company.add(as_user=member).status_code == 403
    assert company.patch(company.admin, as_user=member, full_name="x").status_code == 403
    assert accounts == []


def test_admin_role_cannot_be_given(company, accounts):
    assert company.add(role="admin").status_code == 400
    member = company.add_member("sales_manager")
    assert company.patch(member, role="admin").status_code == 400


def test_validation_errors(company, accounts):
    assert company.add(email="not-an-email").status_code == 400
    assert company.add(full_name=" ").status_code == 400
    assert company.add(role="owner").status_code == 400
    response = company.add(password="short")
    assert response.status_code == 400
    assert "10 characters" in response.json()["error"]["message"]


def test_adding_someone_already_here_is_a_conflict(company, accounts):
    company.add()
    response = company.add()
    assert response.status_code == 409
    assert error_code(response) == "CONFLICT"


def test_person_from_another_company_joins_without_a_password(client, company, accounts):
    other = Company(client, "Other")
    person = other.add(email="shared@acme.example", role="sales_manager").json()
    response = company.add(email="shared@acme.example", password=None, role="marketing_executive")
    assert response.status_code == 201, response.text
    assert response.json()["id"] == person["id"]
    assert response.json()["role"] == "marketing_executive"
    assert other.staff().json()["items"][-1]["role"] == "sales_manager"


def test_executive_can_report_to_their_team_manager(company, accounts):
    manager = company.add_member("marketing_manager")
    response = company.add(role="marketing_executive", manager_id=str(manager))
    assert response.status_code == 201, response.text
    assert response.json()["manager_id"] == str(manager)


def test_bad_reporting_lines_are_refused_without_creating_an_account(client, company, accounts):
    sales_manager = company.add_member("sales_manager")
    other = Company(client, "Other")
    outsider = other.add_member("marketing_manager")
    assert company.add(role="marketing_executive", manager_id=str(sales_manager)).status_code == 400
    assert company.add(role="marketing_executive", manager_id=str(outsider)).status_code == 400
    assert company.add(role="marketing_manager", manager_id=str(sales_manager)).status_code == 400
    assert accounts == []


def test_inactive_manager_cannot_be_chosen(company, accounts):
    manager = company.add_member("marketing_manager")
    company.patch(manager, is_active=False)
    executive = company.add_member("marketing_executive")
    assert company.patch(executive, manager_id=str(manager)).status_code == 400


def test_change_role_saves_and_clears_reporting_lines(company):
    manager = company.add_member("marketing_manager")
    executive = company.add_member("marketing_executive", manager)
    response = company.patch(manager, role="sales_manager")
    assert response.status_code == 200, response.text
    assert response.json()["role"] == "sales_manager"
    assert row("SELECT manager_id FROM memberships WHERE user_id = :u", u=executive)[0] is None
    assert row("SELECT r.name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = :u", u=manager)[0] == "sales_manager"


def test_role_change_clears_their_own_manager(company):
    manager = company.add_member("marketing_manager")
    executive = company.add_member("marketing_executive", manager)
    response = company.patch(executive, role="sales_executive")
    assert response.json()["manager_id"] is None


def test_set_and_clear_manager(company):
    manager = company.add_member("sales_manager")
    executive = company.add_member("sales_executive")
    assert company.patch(executive, manager_id=str(manager)).json()["manager_id"] == str(manager)
    assert company.patch(executive, manager_id=None).json()["manager_id"] is None


def test_only_executives_have_managers(company):
    manager = company.add_member("sales_manager")
    other_manager = company.add_member("marketing_manager")
    assert company.patch(other_manager, manager_id=str(manager)).status_code == 400


def test_new_role_takes_effect_on_the_next_request(company):
    member = company.add_member("sales_manager")
    assert company.staff(member).status_code == 200
    company.patch(member, role="sales_executive")
    assert company.patch(company.admin, as_user=member, is_active=True).status_code == 403


def test_deactivate_and_reactivate(company):
    member = company.add_member("sales_executive")
    response = company.patch(member, is_active=False)
    assert response.json()["is_active"] is False
    assert row("SELECT is_active FROM memberships WHERE user_id = :u", u=member)[0] is False
    assert row("SELECT is_active FROM users WHERE id = :u", u=member)[0] is True
    assert company.staff(member).status_code == 401
    assert company.patch(member, is_active=True).json()["is_active"] is True
    assert company.staff(member).status_code == 200


def test_deactivating_in_one_company_leaves_the_other_alone(client, company, accounts):
    other = Company(client, "Other")
    person = company.add(email="shared@acme.example").json()["id"]
    other.add(email="shared@acme.example", password=None, role="sales_manager")
    company.patch(person, is_active=False)
    assert other.staff(person).status_code == 200
    assert client.get("/api/v1/users", headers=company.headers(person)).status_code == 403


def test_admin_cannot_deactivate_or_demote_themselves(company):
    assert company.patch(company.admin, is_active=False).status_code == 400
    assert company.patch(company.admin, role="sales_manager").status_code == 400
    assert row("SELECT is_active FROM memberships WHERE user_id = :u", u=company.admin)[0] is True


def test_another_admins_role_cannot_be_changed(company):
    other_admin = company.add_member("admin")
    assert company.patch(other_admin, role="sales_manager").status_code == 400


def test_null_role_or_status_are_refused(company):
    member = company.add_member("sales_manager")
    assert company.patch(member, role=None).status_code == 400
    assert company.patch(member, is_active=None).status_code == 400


def test_password_and_name_cannot_be_changed_here(company):
    member = company.add_member("sales_manager")
    before = row("SELECT full_name, password_hash FROM users WHERE id = :u", u=member)
    company.patch(member, full_name="Renamed", password="hacked-password", email="new@evil.example")
    after = row("SELECT full_name, password_hash FROM users WHERE id = :u", u=member)
    assert tuple(after) == tuple(before)


def test_admin_cannot_touch_staff_in_another_company(client, company):
    other = Company(client, "Other")
    outsider = other.add_member("sales_manager")
    response = company.patch(outsider, is_active=False)
    assert response.status_code == 404
    assert error_code(response) == "NOT_FOUND"
    assert row("SELECT is_active FROM memberships WHERE user_id = :u", u=outsider)[0] is True


@pytest.mark.parametrize("header", [None, "not-a-uuid", str(uuid.uuid4())])
def test_workspace_header_must_name_your_company(client, company, header):
    headers = {"Authorization": f"Bearer {token_for(company.admin)}"}
    if header:
        headers["X-Organization-Id"] = header
    response = client.get("/api/v1/users", headers=headers)
    assert response.status_code == 403
    assert error_code(response) == "FORBIDDEN"


def test_cannot_use_another_companys_id(client, company):
    other = Company(client, "Other")
    headers = {"Authorization": f"Bearer {token_for(company.admin)}", "X-Organization-Id": str(other.id)}
    assert client.get("/api/v1/users", headers=headers).status_code == 403


def test_missing_token(client, company):
    response = client.get("/api/v1/users", headers={"X-Organization-Id": str(company.id)})
    assert response.status_code == 401
    assert error_code(response) == "AUTH_INVALID"


def test_expired_token_returns_auth_expired(client, company):
    now = datetime.now(UTC)
    token = token_for(company.admin, iat=now - timedelta(hours=1), exp=now - timedelta(minutes=5))
    response = client.get("/api/v1/users", headers={"Authorization": f"Bearer {token}", "X-Organization-Id": str(company.id)})
    assert response.status_code == 401
    assert error_code(response) == "AUTH_EXPIRED"


def test_bad_tokens_are_rejected(client, company):
    now = datetime.now(UTC)
    claims = {"iss": ISSUER, "sub": str(company.admin), "type": "access", "iat": now, "exp": now + timedelta(minutes=5)}
    tokens = [
        jwt.encode(claims, rsa.generate_private_key(public_exponent=65537, key_size=2048), algorithm="RS256"),
        jwt.encode(claims, key="", algorithm="none"),
        token_for(company.admin, iss="someone-else"),
        token_for(company.admin, type="refresh"),
        token_for("not-a-uuid"),
        token_for(uuid.uuid4()),
        "garbage",
    ]
    for token in tokens:
        response = client.get("/api/v1/users", headers={"Authorization": f"Bearer {token}", "X-Organization-Id": str(company.id)})
        assert response.status_code == 401, token
        assert error_code(response) == "AUTH_INVALID"


def test_auth_service_down_returns_a_clean_error_and_saves_nothing(company, monkeypatch):
    def refuse(*args, **kwargs):
        raise urllib.error.URLError("connection refused")

    monkeypatch.setattr(auth_client.urllib.request, "urlopen", refuse)
    response = company.add()
    assert response.status_code == 502
    assert error_code(response) == "UPSTREAM_FAILED"
    assert "temporary-pass" not in response.text
    assert row("SELECT count(*) FROM memberships WHERE organization_id = :o", o=company.id)[0] == 1


def test_unreachable_database_returns_a_clean_error_and_no_connection_details(client, company):
    broken = create_engine("postgresql+psycopg://crmai:secret-pw@127.0.0.1:1/crmai", connect_args={"connect_timeout": 2})

    def broken_db():
        with sessionmaker(broken)() as db:
            yield db

    app.dependency_overrides[get_db] = broken_db
    try:
        for response in (client.get("/health"), company.staff()):
            assert response.status_code == 500
            assert error_code(response) == "INTERNAL"
            assert "secret-pw" not in response.text
            assert "127.0.0.1" not in response.text
    finally:
        app.dependency_overrides.clear()


def test_health_checks_the_database(client):
    assert client.get("/health").json() == {"status": "ok", "service": "business"}
