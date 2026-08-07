"""Review findings APIs."""

from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import Auth, DbSession
from app.api.errors import DomainError
from app.schemas.review import (
    ReviewFindingsResponse,
    ReviewResolutionHandled,
    ReviewResolutionInput,
    ReviewResolutionResult,
)
from app.services import review as review_service

router = APIRouter(prefix="/api/review", tags=["review"])


@router.get("/findings", response_model=ReviewFindingsResponse)
async def list_findings(
    auth: Auth,
    db: DbSession,
    status: str = Query(default="open"),
    finding_type: Annotated[str | None, Query(alias="type")] = None,
) -> ReviewFindingsResponse:
    if status not in ("open", "resolved"):
        raise DomainError(422, "invalid_status", "不支持的状态")
    parsed_type = (
        review_service.parse_finding_type(finding_type)
        if finding_type
        else None
    )
    if status == "open":
        findings = await review_service.compute_open_findings(
            db,
            auth.workspace.id,
            parsed_type,
        )
    else:
        findings = await review_service.list_resolved_findings(
            db,
            auth.workspace.id,
            parsed_type,
        )
    return ReviewFindingsResponse(findings=findings)


@router.post(
    "/findings/{finding_type}/{target_type}/{target_id}/resolution",
    response_model=ReviewResolutionHandled,
)
async def set_finding_resolution(
    finding_type: str,
    target_type: str,
    target_id: str,
    payload: ReviewResolutionInput,
    auth: Auth,
    db: DbSession,
) -> ReviewResolutionHandled:
    ftype = review_service.parse_finding_type(finding_type)
    ttype = review_service.parse_target_type(target_type)
    await review_service.set_resolution(
        db,
        auth.workspace.id,
        ftype,
        ttype,
        target_id,
        payload.resolution,
        payload.note,
    )
    await db.commit()
    return ReviewResolutionHandled(handled=True)


@router.delete(
    "/findings/{finding_type}/{target_type}/{target_id}/resolution",
    response_model=ReviewResolutionResult,
)
async def remove_finding_resolution(
    finding_type: str,
    target_type: str,
    target_id: str,
    auth: Auth,
    db: DbSession,
) -> ReviewResolutionResult:
    ftype = review_service.parse_finding_type(finding_type)
    ttype = review_service.parse_target_type(target_type)
    removed = await review_service.remove_resolution(
        db,
        auth.workspace.id,
        ftype,
        ttype,
        target_id,
    )
    await db.commit()
    return ReviewResolutionResult(removed=removed)
