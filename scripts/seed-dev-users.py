# Local dev only: creates a demo company with one user per role. Safe to run again.
# Kept out of the service image on purpose, because the password is public.
# Run: docker compose exec -T auth-service python - < scripts/seed-dev-users.py
import secrets

from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models import Membership, Organization, Role, User

PASSWORD = "password123"  # same as the mock API's demo accounts (frontend/README.md)
COMPANY = "CRMAI Demo"
USERS = [
    ("admin@crmai.example", "Demo Admin", "admin"),
    ("marketing.manager@crmai.example", "Demo Marketing Manager", "marketing_manager"),
    ("marketing.exec@crmai.example", "Demo Marketing Executive", "marketing_executive"),
    ("sales.manager@crmai.example", "Demo Sales Manager", "sales_manager"),
    ("sales.exec@crmai.example", "Demo Sales Executive", "sales_executive"),
]

with SessionLocal() as db:
    org = db.scalar(select(Organization).where(Organization.name == COMPANY))
    if org is None:
        org = Organization(name=COMPANY, industry="General", widget_key=f"wk_{secrets.token_urlsafe(24)}")
        db.add(org)
    for email, full_name, role_name in USERS:
        if db.scalar(select(User).where(User.email == email)):
            print(f"exists   {email}")  # never reset a password someone may have changed
            continue
        role = db.scalar(select(Role).where(Role.name == role_name))
        user = User(email=email, password_hash=hash_password(PASSWORD), full_name=full_name, role=role)
        db.add_all([user, Membership(user=user, organization=org, role=role)])
        print(f"created  {email} ({role_name})")
    db.commit()
