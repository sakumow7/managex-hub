from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Role = Literal["requester", "technician", "supervisor", "administrator"]
Team = Literal["cst", "cybersecurity", "development", "it_operations"]
Priority = Literal["low", "medium", "high", "urgent"]
Status = Literal["submitted", "assigned", "in_progress", "blocked", "completed", "closed"]
Kind = Literal[
    "support", "service_request", "access_request", "security", "bug", "task", "change", "maintenance", "inspection"
]


class Login(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    name: str
    role: Role
    team: Team


class UserCreate(BaseModel):
    email: str = Field(min_length=3, max_length=254, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
    name: str = Field(min_length=1, max_length=100)
    role: Role
    team: Team = "cst"
    password: str = Field(min_length=12, max_length=128)


class OrderCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    title: str = Field(min_length=3, max_length=160)
    description: str = Field(min_length=5, max_length=10000)
    location: str = Field(default="Not specified", min_length=2, max_length=120)
    category: str = Field(default="General", min_length=2, max_length=40)
    kind: Kind = "support"
    team: Team = "cst"
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
    team: Team | None = None
    status: Status | None = None
    note: str = Field(default="", max_length=2000)


class OrderOut(OrderCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    restricted: bool
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
    sample_key: Literal["inspection-checklist", "maintenance-note", "troubleshooting-note", "change-checklist"]


class CommentCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    body: str = Field(min_length=1, max_length=5000)
    internal: bool = False
