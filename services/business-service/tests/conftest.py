import os
import secrets
import subprocess
import tempfile
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

# Throwaway key that stands in for auth-service's, set before the app reads its settings.
ISSUER = "crmai-auth"
_keys = Path(tempfile.mkdtemp())
TEST_PRIVATE_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
(_keys / "public.pem").write_bytes(
    TEST_PRIVATE_KEY.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
    )
)
os.environ["JWT_PUBLIC_KEY_PATH"] = str(_keys / "public.pem")

import jwt  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, make_url, text  # noqa: E402


def token_for(user_id, **overrides):
    now = datetime.now(UTC)
    claims = {
        "iss": ISSUER, "sub": str(user_id), "role": "admin", "type": "access",
        "iat": now, "exp": now + timedelta(minutes=5),
    }
    return jwt.encode({**claims, **overrides}, TEST_PRIVATE_KEY, algorithm="RS256")


def insert_user(connection, email, role="admin"):
    user_id = uuid.uuid4()
    connection.execute(
        text("INSERT INTO users (id, role_id, email, password_hash, full_name, is_active, created_at, updated_at) "
             "VALUES (:id, (SELECT id FROM roles WHERE name = :role), :email, 'stored-by-auth', :name, true, now(), now())"),
        {"id": user_id, "role": role, "email": email, "name": email.split("@")[0]},
    )
    return user_id


def insert_company(connection, name="Acme"):
    org_id = uuid.uuid4()
    connection.execute(
        text("INSERT INTO organizations (id, name, industry, plan, widget_key, timezone, product_label, created_at) "
             "VALUES (:id, :name, 'Retail', 'trial', :key, 'Asia/Colombo', 'package', now())"),
        {"id": org_id, "name": name, "key": f"wk_{secrets.token_urlsafe(12)}"},
    )
    return org_id


def insert_membership(connection, user_id, org_id, role="admin", manager_id=None):
    connection.execute(
        text("INSERT INTO memberships (id, user_id, organization_id, role_id, manager_id) "
             "VALUES (:id, :user, :org, (SELECT id FROM roles WHERE name = :role), :manager)"),
        {"id": uuid.uuid4(), "user": user_id, "org": org_id, "role": role, "manager": manager_id},
    )


@pytest.fixture(scope="session", autouse=True)
def database():
    """Recreate the test database and build it with auth-service's real migrations."""
    url = make_url(os.environ["DATABASE_URL"])
    assert url.database.endswith("_test"), "Tests drop this database, so it must be a test database"
    admin = create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with admin.connect() as connection:
        connection.execute(text(f'DROP DATABASE IF EXISTS "{url.database}" WITH (FORCE)'))
        connection.execute(text(f'CREATE DATABASE "{url.database}"'))
    admin.dispose()
    env = {**os.environ, "PYTHONPATH": "/auth-service", "JWT_PRIVATE_KEY_PATH": "/dev/null"}
    subprocess.run(["alembic", "upgrade", "head"], cwd="/auth-service", env=env, check=True)


@pytest.fixture(autouse=True)
def clean_state(database):
    from app.db.session import engine

    with engine.begin() as connection:
        connection.execute(text("TRUNCATE users, organizations, memberships, organization_channels CASCADE"))


@pytest.fixture
def client():
    from app.main import app

    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def accounts(monkeypatch):
    """Stands in for auth-service: records the call and creates the account row."""
    from app.core.errors import AppError
    from app.db.session import engine
    from app.services import auth_client

    calls = []

    def fake(email, full_name, password, role):
        calls.append({"email": email, "full_name": full_name, "password": password, "role": role})
        with engine.begin() as connection:
            existing = connection.scalar(text("SELECT id FROM users WHERE email = :email"), {"email": email})
            if existing:
                return existing
            if not password or len(password) < 10:
                raise AppError(400, "VALIDATION_ERROR", "Password must be at least 10 characters")
            return insert_user(connection, email, role)

    monkeypatch.setattr(auth_client, "find_or_create_account", fake)
    return calls
