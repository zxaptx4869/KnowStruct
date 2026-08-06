"""Project and knowledge-directory request/response schemas."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.inbox import EntryTypeValue

ProjectStatusValue = Literal["planning", "active", "paused", "completed"]
TrimmedProjectName = Annotated[str, Field(min_length=1, max_length=100)]
TrimmedNodeName = Annotated[str, Field(min_length=1, max_length=100)]
TrimmedEntryTitle = Annotated[str, Field(min_length=1, max_length=200)]
TrimmedEntryContent = Annotated[str, Field(min_length=1, max_length=20000)]


def strip_required(value: str) -> str:
    return value.strip()


def strip_optional(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


class ProjectCreate(BaseModel):
    name: TrimmedProjectName
    goal: str | None = Field(default=None, max_length=500)
    background: str | None = Field(default=None, max_length=2000)
    status: ProjectStatusValue = "planning"

    _strip_name = field_validator("name", mode="before")(strip_required)
    _strip_optional = field_validator("goal", "background", mode="before")(strip_optional)


class ProjectUpdate(BaseModel):
    name: TrimmedProjectName | None = None
    goal: str | None = Field(default=None, max_length=500)
    background: str | None = Field(default=None, max_length=2000)
    status: ProjectStatusValue | None = None

    _strip_name = field_validator("name", mode="before")(strip_required)
    _strip_optional = field_validator("goal", "background", mode="before")(strip_optional)

    @model_validator(mode="after")
    def require_change(self) -> "ProjectUpdate":
        if not self.model_fields_set:
            raise ValueError("At least one project field is required")
        return self


class ProjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    goal: str | None
    background: str | None
    status: ProjectStatusValue
    node_count: int = 0
    created_at: datetime
    updated_at: datetime


class NodeCreate(BaseModel):
    name: TrimmedNodeName
    description: str | None = Field(default=None, max_length=1000)
    parent_id: str | None = None

    _strip_name = field_validator("name", mode="before")(strip_required)
    _strip_description = field_validator("description", mode="before")(strip_optional)


class NodeUpdate(BaseModel):
    name: TrimmedNodeName | None = None
    description: str | None = Field(default=None, max_length=1000)

    _strip_name = field_validator("name", mode="before")(strip_required)
    _strip_description = field_validator("description", mode="before")(strip_optional)

    @model_validator(mode="after")
    def require_change(self) -> "NodeUpdate":
        if not self.model_fields_set:
            raise ValueError("At least one node field is required")
        return self


class NodeMove(BaseModel):
    parent_id: str | None = None
    position: int = Field(ge=0)


class NodeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    parent_id: str | None
    name: str
    description: str | None
    sort_order: int
    entry_count: int = 0
    created_at: datetime
    updated_at: datetime


class NodeDeleteResponse(BaseModel):
    deleted_count: int
    parent_id: str | None


class NodeEntrySourceRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    source_type: str
    title: str


class NodeEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    entry_type: str
    title: str
    content: str
    applicable_conditions: list[str] | None
    node_id: str | None = None
    sources: list[NodeEntrySourceRef] = Field(default_factory=list)
    created_at: datetime


class EntryUpdate(BaseModel):
    title: TrimmedEntryTitle | None = None
    content: TrimmedEntryContent | None = None
    entry_type: EntryTypeValue | None = None
    applicable_conditions: list[str] | None = None
    node_id: str | None = None

    @field_validator("title", "content", mode="before")
    @classmethod
    def strip_optional_text(cls, value: object) -> object:
        if value is None:
            return None
        if not isinstance(value, str):
            return value
        return value.strip()

    @model_validator(mode="after")
    def require_change(self) -> "EntryUpdate":
        if not self.model_fields_set:
            raise ValueError("至少提交一个可编辑字段")
        return self
