from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Role = Literal["requester", "technician", "supervisor", "administrator"]
Priority = Literal["low", "medium", "high", "urgent"]
Status = Literal["submitted", "assigned", "in_progress", "completed", "closed"]
Category = Literal["Electrical", "Plumbing", "HVAC", "Safety", "General"]


class Login(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    name: str
    role: Role


class UserCreate(BaseModel):
    email: str = Field(min_length=3, max_length=254, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
    name: str = Field(min_length=1, max_length=100)
    role: Role
    password: str = Field(min_length=12, max_length=128)


class OrderCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    title: str = Field(min_length=3, max_length=160)
    description: str = Field(min_length=5, max_length=10000)
    location: str = Field(min_length=2, max_length=120)
    category: Category = "General"
    kind: Literal["maintenance", "inspection"] = "maintenance"
    priority: Priority = "medium"
    due_at: datetime | None = None

    @field_validator("due_at")
    @classmethod
    def require_timezone(cls, value):
        if value is not None and value.tzinfo is None:
            raise ValueError("due_at must include a timezone")
        return value


class OrderUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    priority: Priority | None = None
    assignee_id: int | None = None
    status: Status | None = None
    note: str = Field(default="", max_length=2000)


class OrderOut(OrderCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    requester_id: int
    assignee_id: int | None
    status: Status
    created_at: datetime
    closed_at: datetime | None

    @field_validator("due_at", "created_at", "closed_at")
    @classmethod
    def require_timezone(cls, value):
        # SQLite tests discard offsets; database timestamps represent UTC.
        return value.replace(tzinfo=timezone.utc) if value and value.tzinfo is None else value


class SampleAttachment(BaseModel):
    sample_key: Literal["inspection-checklist", "maintenance-note"]
