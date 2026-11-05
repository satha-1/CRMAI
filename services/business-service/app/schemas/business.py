import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, Field, StringConstraints

Email = Annotated[EmailStr, AfterValidator(str.lower)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
# The admin role comes only from creating a company, so this API cannot hand it out.
WorkRole = Literal["marketing_manager", "marketing_executive", "sales_manager", "sales_executive"]
ChannelCode = Literal["website", "email", "whatsapp", "facebook", "instagram", "voice"]


class StaffIn(BaseModel):
    email: Email
    full_name: Name
    # Only needed for a new account. An existing account keeps its own password.
    password: str | None = Field(default=None, max_length=128)
    role: WorkRole
    manager_id: uuid.UUID | None = None


class StaffUpdate(BaseModel):
    # Name and password are left out on purpose: they belong to the person's account across all their companies.
    role: WorkRole | None = None
    manager_id: uuid.UUID | None = None
    is_active: bool | None = None


class StaffOut(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: str
    is_active: bool
    created_at: datetime
    manager_id: uuid.UUID | None


class StaffPage(BaseModel):
    items: list[StaffOut]
    next_cursor: None = None


class OrganizationIn(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=120)]
    industry: Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)] = "General"


class ChannelIn(BaseModel):
    code: ChannelCode
    is_enabled: bool


class OrganizationUpdate(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=120)] | None = None
    industry: Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)] | None = None
    timezone: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_+\-/]+$")] | None = None
    product_label: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)] | None = None
    channels: list[ChannelIn] | None = None


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
