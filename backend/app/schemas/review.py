"""Review finding request/response schemas."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.review import FindingTargetType, FindingType, ResolutionType


class ReviewFindingItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    finding_type: FindingType
    target_type: FindingTargetType
    target_id: str
    title: str
    summary: str
    created_at: datetime | None = None
    # Entry 证据
    entry_type: str | None = None
    content: str | None = None
    conditions: list[str] | None = None
    project_id: str | None = None
    project_name: str | None = None
    node_id: str | None = None
    node_path: list[str] = Field(default_factory=list)
    # Source 证据
    source_type: str | None = None
    link_url: str | None = None
    pending_count: int | None = None
    # 处理信息（已处理视图）
    resolution: ResolutionType | None = None
    note: str | None = None
    resolved_at: datetime | None = None


class ReviewFindingsResponse(BaseModel):
    findings: list[ReviewFindingItem]


class ReviewResolutionInput(BaseModel):
    resolution: ResolutionType
    note: str | None = Field(default=None, max_length=500)


class ReviewResolutionHandled(BaseModel):
    handled: bool


class ReviewResolutionResult(BaseModel):
    removed: bool = False
