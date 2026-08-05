"""Capture inbox, processing, extraction, and entry confirmation schemas."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field, field_validator, model_validator

SourceTypeValue = Literal["text", "link"]
ProcessingStateValue = Literal["processing", "failed", "pending_confirm", "done"]
DecisionValue = Literal["accepted", "rejected"]
EntryTypeValue = Literal[
    "experience",
    "parameter",
    "pitfall",
    "product",
    "price",
    "decision",
    "todo",
    "question",
]

TrimmedTitle = Annotated[str, Field(min_length=1, max_length=200)]
TrimmedTextContent = Annotated[str, Field(min_length=1, max_length=20000)]
TrimmedLinkNote = Annotated[str, Field(min_length=1, max_length=2000)]


def strip_required(value: str) -> str:
    return value.strip()


def strip_optional(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


class SourceCreate(BaseModel):
    source_type: SourceTypeValue
    content: str | None = None
    link_url: str | None = None
    project_id: str | None = None

    _strip_content = field_validator("content", mode="before")(strip_optional)
    _strip_url = field_validator("link_url", mode="before")(strip_optional)

    @field_validator("link_url")
    @classmethod
    def validate_link_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        parsed = AnyHttpUrl(value)
        if parsed.scheme not in {"http", "https"}:
            raise ValueError("链接必须以 http:// 或 https:// 开头")
        if len(value) > 2048:
            raise ValueError("链接过长")
        return value

    @model_validator(mode="after")
    def validate_by_type(self) -> "SourceCreate":
        if self.source_type == "text":
            if not self.content:
                raise ValueError("文字内容不能为空")
            if len(self.content) > 20000:
                raise ValueError("文字内容不能超过 20000 字符")
        elif self.source_type == "link":
            if not self.link_url:
                raise ValueError("链接不能为空")
            if not self.content:
                raise ValueError("请补充这条链接的说明，作为可提取内容")
            if len(self.content) > 2000:
                raise ValueError("补充说明不能超过 2000 字符")
        return self


class CandidateCounts(BaseModel):
    pending_confirm: int = 0
    accepted: int = 0
    rejected: int = 0


class TaskInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    stage: str
    status: str
    attempt_count: int
    last_error: str | None = None
    claimed_at: datetime | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None


class ExtractionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    source_id: str
    status: str
    title: str
    content: str
    entry_type: str
    suggested_node_path: str | None = None
    applicable_conditions: list[str] | None = None
    risk_points: list[str] | None = None
    confidence: float | None = None
    decided_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class SourceListItem(BaseModel):
    id: str
    source_type: str
    title: str
    content: str
    link_url: str | None = None
    content_status: str
    project_id: str | None = None
    project_name: str | None = None
    processing_state: ProcessingStateValue
    candidates: CandidateCounts
    task: TaskInfo | None = None
    created_at: datetime
    updated_at: datetime


class SourceDetailResponse(SourceListItem):
    extractions: list[ExtractionResponse] = Field(default_factory=list)


class DecideRequest(BaseModel):
    decision: DecisionValue
    project_id: str | None = None
    node_id: str | None = None
    title: TrimmedTitle | None = None
    content: TrimmedTextContent | None = None
    entry_type: EntryTypeValue | None = None
    applicable_conditions: list[str] | None = None

    _strip_title = field_validator("title", mode="before")(strip_optional)
    _strip_content = field_validator("content", mode="before")(strip_optional)

    @model_validator(mode="after")
    def require_edits_are_valid(self) -> "DecideRequest":
        if self.decision == "accepted" and not self.project_id:
            raise ValueError("接受候选前必须确认项目")
        return self


class EntrySummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    node_id: str | None = None
    entry_type: str
    title: str
    status: str
    created_at: datetime


class DecideResponse(BaseModel):
    decision: DecisionValue
    extraction_id: str
    entry: EntrySummary | None = None


class CompleteResponse(BaseModel):
    total: int
    pending_confirm: int
    accepted: int
    rejected: int
    completed: bool
