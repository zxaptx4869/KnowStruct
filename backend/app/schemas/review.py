"""Review finding request/response schemas."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.review import (
    AiReviewType,
    FindingTargetType,
    FindingType,
    ResolutionType,
    ScanScopeType,
)


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
    # AI 问题证据（对偶记录）
    entry_b_id: str | None = None
    entry_b_title: str | None = None
    entry_b_content: str | None = None
    entry_b_project_id: str | None = None
    entry_b_node_id: str | None = None
    ai_description: str | None = None
    ai_suggestion: str | None = None
    ai_severity: str | None = None
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


class ReviewScanCreate(BaseModel):
    scope_type: ScanScopeType
    project_id: str | None = None
    node_id: str | None = None


class ReviewScanResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    scope_type: ScanScopeType
    scope_id: str | None
    status: str
    truncated: bool
    findings_count: int
    resurfaced_count: int
    last_error: str | None
    started_at: datetime | None
    created_at: datetime | None
    finished_at: datetime | None


class ReviewScanListResponse(BaseModel):
    scans: list[ReviewScanResponse]


class ReviewAiEntryRef(BaseModel):
    id: str
    title: str
    content: str
    entry_type: str
    project_id: str | None = None
    project_name: str | None = None
    node_id: str | None = None
    node_path: list[str] = Field(default_factory=list)


class ReviewCandidateItem(BaseModel):
    id: str
    review_type: AiReviewType
    status: str
    description: str
    suggestion: str | None
    severity: str
    entry_a: ReviewAiEntryRef
    entry_b: ReviewAiEntryRef


class ReviewCandidatesResponse(BaseModel):
    candidates: list[ReviewCandidateItem]


class ReviewDecisionInput(BaseModel):
    decision: Literal["confirmed", "rejected"]


class ReviewDecisionResult(BaseModel):
    status: str
