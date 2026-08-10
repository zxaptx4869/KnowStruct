"""AI 目录起草请求/响应 schema。"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.projects import strip_optional, strip_required


class DraftNodeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    parent_id: str | None
    name: str
    description: str | None
    selected: bool
    sort_order: int


class ClarifyQuestionResponse(BaseModel):
    id: str
    text: str
    options: list[str] = Field(default_factory=list)


class DraftResponse(BaseModel):
    id: str
    project_id: str
    status: str
    next_action: str
    intent_note: str | None = None
    clarify: list[ClarifyQuestionResponse] = Field(default_factory=list)
    nodes: list[DraftNodeResponse] = Field(default_factory=list)
    last_error: str | None = None
    created_at: datetime
    updated_at: datetime


class DraftEnvelope(BaseModel):
    draft: DraftResponse | None = None


class DraftCreate(BaseModel):
    background: str | None = Field(default=None, max_length=2000)

    _strip_background = field_validator("background", mode="before")(strip_optional)


class ClarifySubmit(BaseModel):
    answers: dict[str, str] = Field(default_factory=dict)


class RefineSubmit(BaseModel):
    instruction: str = Field(min_length=1, max_length=1000)

    _strip_instruction = field_validator("instruction", mode="before")(strip_required)


class RedraftSubmit(BaseModel):
    background: str | None = Field(default=None, max_length=2000)

    _strip_background = field_validator("background", mode="before")(strip_optional)


class DraftNodeEdit(BaseModel):
    name: str | None = Field(default=None, max_length=100)
    selected: bool | None = None

    @model_validator(mode="after")
    def require_change(self) -> "DraftNodeEdit":
        if self.name is None and self.selected is None:
            raise ValueError("At least one node field is required")
        return self


class DraftConfirmResponse(BaseModel):
    created_count: int
    status: str
