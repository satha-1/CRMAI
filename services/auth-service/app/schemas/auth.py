import uuid
from datetime import datetime
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, Field, StringConstraints

Email = Annotated[EmailStr, AfterValidator(str.lower)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]


class AccountIn(BaseModel):
    email: Email
    full_name: Name
    # Only needed for a new account. An existing account keeps its own password.
    password: str | None = Field(default=None, max_length=128)
    role: str


class AccountOut(BaseModel):
    id: uuid.UUID
    created: bool


class LoginIn(BaseModel):
    email: Email
    password: str = Field(min_length=8, max_length=128)


class SignupIn(BaseModel):
    company_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=120)]
    industry: Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)] = "General"
    full_name: Name
    email: Email
    password: str = Field(min_length=10, max_length=128)


class RefreshIn(BaseModel):
    refresh_token: str = Field(min_length=1, max_length=512)


class UserSummary(BaseModel):
    id: uuid.UUID
    full_name: str
    role: str


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    expires_in: int
    user: UserSummary


class SignupOut(TokenOut):
    organization_id: uuid.UUID


class ChannelOut(BaseModel):
    code: str
    is_enabled: bool


class OrganizationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    industry: str
    plan: str
    widget_key: str
    timezone: str
    product_label: str
    created_at: datetime
    channels: list[ChannelOut]


class MembershipOut(BaseModel):
    organization: OrganizationOut
    role: str


class MeOut(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: str
    permissions: list[str]
    memberships: list[MembershipOut]
