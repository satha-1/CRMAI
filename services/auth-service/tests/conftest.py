import os
import tempfile
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

# Throwaway keys, set before the app reads its settings.
_keys = Path(tempfile.mkdtemp())
_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
(_keys / "private.pem").write_bytes(
    _key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    )
)
(_keys / "public.pem").write_bytes(
    _key.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
)
os.environ["JWT_PRIVATE_KEY_PATH"] = str(_keys / "private.pem")
os.environ["JWT_PUBLIC_KEY_PATH"] = str(_keys / "public.pem")

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, make_url, text  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def database():
    """Recreate the test database and build it with the real migrations."""
    url = make_url(os.environ["DATABASE_URL"])
    assert url.database.endswith("_test"), "Tests drop this database, so it must be a test database"
    admin = create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with admin.connect() as connection:
        connection.execute(text(f'DROP DATABASE IF EXISTS "{url.database}" WITH (FORCE)'))
        connection.execute(text(f'CREATE DATABASE "{url.database}"'))
    admin.dispose()
    command.upgrade(Config("alembic.ini"), "head")


@pytest.fixture(autouse=True)
def clean_state(database):
    from app.core.rate_limit import login_throttle
    from app.db.session import engine

    with engine.begin() as connection:
        connection.execute(text("TRUNCATE users, organizations, refresh_tokens, memberships CASCADE"))
    login_throttle.clear()


@pytest.fixture
def client():
    from app.main import app

    return TestClient(app, raise_server_exceptions=False)
