import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from sqlalchemy import text

from app.core.config import get_settings
from app.core.security import create_access_token
from app.db.session import engine

BASE = "/api/v1/auth"
PASSWORD = "correct-horse-battery"


def signup(client, email="owner@acme.example", password=PASSWORD):
    response = client.post(
        f"{BASE}/signup",
        json={"company_name": "Acme", "industry": "Travel", "full_name": "Owner", "email": email, "password": password},
    )
    assert response.status_code == 201, response.text
    return response.json()


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


def error_code(response):
    return response.json()["error"]["code"]


def access_claims(**overrides):
    now = datetime.now(UTC)
    claims = {
        "iss": get_settings().jwt_issuer,
        "sub": str(uuid.uuid4()),
        "role": "admin",
        "type": "access",
        "iat": now,
        "exp": now + timedelta(minutes=5),
    }
    return {**claims, **overrides}


def test_health_checks_the_database(client):
    assert client.get(f"{BASE}/health").json() == {"status": "ok", "service": "auth"}


def test_signup_creates_a_company_with_its_first_admin(client):
    tokens = signup(client)
    assert tokens["expires_in"] == 900
    assert tokens["user"]["role"] == "admin"

    me = client.get(f"{BASE}/me", headers=bearer(tokens["access_token"]))
    assert me.status_code == 200
    body = me.json()
    assert body["email"] == "owner@acme.example"
    assert "user.manage" in body["permissions"]
    assert "customer.read" not in body["permissions"]
    assert "password_hash" not in me.text

    membership = body["memberships"][0]
    assert membership["role"] == "admin"
    assert membership["organization"]["id"] == tokens["organization_id"]
    assert membership["organization"]["name"] == "Acme"
    assert {"code": "website", "is_enabled": True} in membership["organization"]["channels"]


def test_signup_rejects_a_duplicate_email_in_any_case(client):
    signup(client)
    response = client.post(
        f"{BASE}/signup",
        json={"company_name": "Other", "full_name": "X", "email": "OWNER@acme.example", "password": PASSWORD},
    )
    assert response.status_code == 409
    assert error_code(response) == "CONFLICT"
    with engine.connect() as connection:
        assert connection.scalar(text("SELECT count(*) FROM organizations")) == 1


def test_validation_error_uses_the_spec_body_and_hides_the_password(client):
    secret = "short-pw"
    response = client.post(
        f"{BASE}/signup",
        json={"company_name": "Acme", "full_name": "X", "email": "a@acme.example", "password": secret},
    )
    assert response.status_code == 400
    error = response.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert error["details"] == [{"field": "password", "issue": "string_too_short"}]
    assert error["request_id"]
    assert secret not in response.text


def test_login_is_case_insensitive_on_email(client):
    signup(client)
    response = client.post(f"{BASE}/login", json={"email": "Owner@Acme.example", "password": PASSWORD})
    assert response.status_code == 200
    assert response.json()["user"]["role"] == "admin"


def test_wrong_password_and_unknown_email_look_the_same(client):
    signup(client)
    wrong = client.post(f"{BASE}/login", json={"email": "owner@acme.example", "password": "wrong-password"})
    unknown = client.post(f"{BASE}/login", json={"email": "nobody@acme.example", "password": "wrong-password"})
    assert wrong.status_code == unknown.status_code == 401
    assert error_code(wrong) == error_code(unknown) == "AUTH_INVALID"
    assert wrong.json()["error"]["message"] == unknown.json()["error"]["message"]


def test_login_is_blocked_after_ten_failures_even_with_the_right_password(client):
    signup(client)
    for _ in range(10):
        response = client.post(f"{BASE}/login", json={"email": "owner@acme.example", "password": "wrong-password"})
        assert response.status_code == 401
    response = client.post(f"{BASE}/login", json={"email": "owner@acme.example", "password": PASSWORD})
    assert response.status_code == 429
    assert error_code(response) == "RATE_LIMITED"


def test_password_longer_than_72_bytes_works_and_is_fully_checked(client):
    long_password = "a" * 100
    signup(client, password=long_password)
    good = client.post(f"{BASE}/login", json={"email": "owner@acme.example", "password": long_password})
    assert good.status_code == 200
    bad = client.post(f"{BASE}/login", json={"email": "owner@acme.example", "password": "a" * 99 + "b"})
    assert bad.status_code == 401


def test_refresh_rotates_the_token(client):
    tokens = signup(client)
    response = client.post(f"{BASE}/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert response.status_code == 200
    new = response.json()
    assert new["refresh_token"] != tokens["refresh_token"]
    assert client.get(f"{BASE}/me", headers=bearer(new["access_token"])).status_code == 200


def test_reusing_a_refresh_token_revokes_the_whole_family(client):
    tokens = signup(client)
    new = client.post(f"{BASE}/refresh", json={"refresh_token": tokens["refresh_token"]}).json()

    reused = client.post(f"{BASE}/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert reused.status_code == 401
    assert error_code(reused) == "AUTH_REVOKED"

    after = client.post(f"{BASE}/refresh", json={"refresh_token": new["refresh_token"]})
    assert after.status_code == 401
    assert error_code(after) == "AUTH_REVOKED"


def test_reuse_does_not_end_other_sessions(client):
    first = signup(client)
    second = client.post(f"{BASE}/login", json={"email": "owner@acme.example", "password": PASSWORD}).json()
    client.post(f"{BASE}/refresh", json={"refresh_token": first["refresh_token"]})
    client.post(f"{BASE}/refresh", json={"refresh_token": first["refresh_token"]})
    assert client.post(f"{BASE}/refresh", json={"refresh_token": second["refresh_token"]}).status_code == 200


def test_expired_refresh_token(client):
    tokens = signup(client)
    with engine.begin() as connection:
        connection.execute(text("UPDATE refresh_tokens SET expires_at = now() - interval '1 minute'"))
    response = client.post(f"{BASE}/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert response.status_code == 401
    assert error_code(response) == "AUTH_EXPIRED"


def test_unknown_refresh_token(client):
    response = client.post(f"{BASE}/refresh", json={"refresh_token": "made-up"})
    assert response.status_code == 401
    assert error_code(response) == "AUTH_REVOKED"


def test_refresh_token_is_only_stored_as_a_hash(client):
    tokens = signup(client)
    with engine.connect() as connection:
        stored = connection.scalar(text("SELECT token_hash FROM refresh_tokens"))
    assert stored != tokens["refresh_token"]
    assert len(stored) == 64


def test_logout_revokes_the_session(client):
    tokens = signup(client)
    response = client.post(
        f"{BASE}/logout", json={"refresh_token": tokens["refresh_token"]}, headers=bearer(tokens["access_token"])
    )
    assert response.status_code == 204
    assert client.post(f"{BASE}/refresh", json={"refresh_token": tokens["refresh_token"]}).status_code == 401


def test_logout_after_a_refresh_ends_the_session(client):
    tokens = signup(client)
    new = client.post(f"{BASE}/refresh", json={"refresh_token": tokens["refresh_token"]}).json()
    client.post(
        f"{BASE}/logout", json={"refresh_token": tokens["refresh_token"]}, headers=bearer(new["access_token"])
    )
    assert client.post(f"{BASE}/refresh", json={"refresh_token": new["refresh_token"]}).status_code == 401


def test_logout_cannot_revoke_another_users_session(client):
    victim = signup(client)
    attacker = signup(client, email="attacker@acme.example")
    response = client.post(
        f"{BASE}/logout", json={"refresh_token": victim["refresh_token"]}, headers=bearer(attacker["access_token"])
    )
    assert response.status_code == 204
    assert client.post(f"{BASE}/refresh", json={"refresh_token": victim["refresh_token"]}).status_code == 200


def test_missing_token(client):
    response = client.get(f"{BASE}/me")
    assert response.status_code == 401
    assert error_code(response) == "AUTH_INVALID"


def test_expired_access_token_returns_auth_expired(client):
    tokens = signup(client)
    user_id = tokens["user"]["id"]
    private_key = get_settings().jwt_private_key_path.read_text()
    now = datetime.now(UTC)
    token = jwt.encode(
        access_claims(sub=user_id, iat=now - timedelta(hours=1), exp=now - timedelta(minutes=5)),
        private_key,
        algorithm="RS256",
    )
    response = client.get(f"{BASE}/me", headers=bearer(token))
    assert response.status_code == 401
    assert error_code(response) == "AUTH_EXPIRED"


@pytest.mark.parametrize("change", ["other_key", "wrong_issuer", "wrong_type", "bad_subject", "garbage"])
def test_bad_access_tokens_are_rejected(client, change):
    tokens = signup(client)
    private_key = get_settings().jwt_private_key_path.read_text()
    user_id = tokens["user"]["id"]
    if change == "other_key":
        token = jwt.encode(
            access_claims(sub=user_id), rsa.generate_private_key(public_exponent=65537, key_size=2048), algorithm="RS256"
        )
    elif change == "wrong_issuer":
        token = jwt.encode(access_claims(sub=user_id, iss="someone-else"), private_key, algorithm="RS256")
    elif change == "wrong_type":
        token = jwt.encode(access_claims(sub=user_id, type="refresh"), private_key, algorithm="RS256")
    elif change == "bad_subject":
        token = jwt.encode(access_claims(sub="not-a-uuid"), private_key, algorithm="RS256")
    else:
        token = "garbage"
    response = client.get(f"{BASE}/me", headers=bearer(token))
    assert response.status_code == 401
    assert error_code(response) == "AUTH_INVALID"


def test_unsigned_token_is_rejected(client):
    user_id = signup(client)["user"]["id"]
    token = jwt.encode(access_claims(sub=user_id), key="", algorithm="none")
    response = client.get(f"{BASE}/me", headers=bearer(token))
    assert response.status_code == 401
    assert error_code(response) == "AUTH_INVALID"


def test_deactivated_user_loses_access_right_away(client):
    tokens = signup(client)
    with engine.begin() as connection:
        connection.execute(text("UPDATE users SET is_active = false"))
    assert client.get(f"{BASE}/me", headers=bearer(tokens["access_token"])).status_code == 401
    assert client.post(f"{BASE}/login", json={"email": "owner@acme.example", "password": PASSWORD}).status_code == 401
    assert client.post(f"{BASE}/refresh", json={"refresh_token": tokens["refresh_token"]}).status_code == 401


def test_token_for_a_deleted_user_is_rejected(client):
    token = create_access_token(str(uuid.uuid4()), "admin")
    assert client.get(f"{BASE}/me", headers=bearer(token)).status_code == 401


def test_unknown_path_uses_the_spec_error_body(client):
    response = client.get("/api/v1/auth/nope")
    assert response.status_code == 404
    assert error_code(response) == "NOT_FOUND"
