"""Review findings APIs."""

from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy import select

from app.api.deps import Auth, DbSession
from app.api.errors import ConflictError, DomainError
from app.models import ReviewScan, ScanStatus
from app.schemas.review import (
    ReviewFindingsResponse,
    ReviewResolutionHandled,
    ReviewResolutionInput,
    ReviewResolutionResult,
    ReviewScanCreate,
    ReviewScanListResponse,
    ReviewScanResponse,
)
from app.services import review as review_service
from app.services import review_scan as scan_service

router = APIRouter(prefix="/api/review", tags=["review"])


@router.get("/findings", response_model=ReviewFindingsResponse)
async def list_findings(
    auth: Auth,
    db: DbSession,
    status: str = Query(default="open"),
    finding_type: Annotated[str | None, Query(alias="type")] = None,
) -> ReviewFindingsResponse:
    if status not in ("open", "resolved", "rejected"):
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
    elif status == "resolved":
        findings = await review_service.list_resolved_findings(
            db,
            auth.workspace.id,
            parsed_type,
        )
    else:
        findings = await review_service.list_rejected_findings(
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


@router.post("/scans", response_model=ReviewScanResponse)
async def start_review_scan(
    payload: ReviewScanCreate,
    auth: Auth,
    db: DbSession,
) -> ReviewScanResponse:
    existing = await db.scalar(
        select(ReviewScan.id).where(
            ReviewScan.workspace_id == auth.workspace.id,
            ReviewScan.status.in_(
                [ScanStatus.PENDING.value, ScanStatus.RUNNING.value]
            ),
        )
    )
    if existing is not None:
        raise ConflictError(
            "scan_in_progress",
            "已有扫描进行中，请等待完成",
        )
    scope_id = await scan_service.validate_scope(
        db,
        auth.workspace.id,
        payload.scope_type,
        payload.project_id,
        payload.node_id,
    )
    scan = ReviewScan(
        workspace_id=auth.workspace.id,
        scope_type=payload.scope_type.value,
        scope_id=scope_id,
        status=ScanStatus.PENDING.value,
    )
    db.add(scan)
    await db.commit()
    await db.refresh(scan)
    return scan


@router.get("/scans", response_model=ReviewScanListResponse)
async def list_review_scans(
    auth: Auth,
    db: DbSession,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> ReviewScanListResponse:
    scans, total = await scan_service.list_scans(
        db,
        auth.workspace.id,
        limit,
        offset,
    )
    names, summaries = await scan_service.scan_display_details(
        db,
        auth.workspace.id,
        scans,
    )
    items = []
    for scan in scans:
        duration_seconds = None
        if scan.created_at is not None and scan.finished_at is not None:
            duration_seconds = max(
                0,
                int(
                    (
                        scan.finished_at - scan.created_at
                    ).total_seconds()
                ),
            )
        items.append(
            ReviewScanResponse(
                id=scan.id,
                scope_type=scan.scope_type,
                scope_id=scan.scope_id,
                status=scan.status,
                truncated=scan.truncated,
                findings_count=scan.findings_count,
                resurfaced_count=scan.resurfaced_count,
                skipped_rejected_count=scan.skipped_rejected_count,
                last_error=scan.last_error,
                started_at=scan.started_at,
                created_at=scan.created_at,
                finished_at=scan.finished_at,
                scope_name=(
                    names.get(scan.scope_id) if scan.scope_id else None
                ),
                duration_seconds=duration_seconds,
                decision_summary=summaries.get(
                    scan.id,
                    {"resolved": 0, "rejected": 0, "pending": 0},
                ),
            )
        )
    return ReviewScanListResponse(scans=items, total=total)


@router.get("/scans/{scan_id}", response_model=ReviewScanResponse)
async def get_review_scan(
    scan_id: str,
    auth: Auth,
    db: DbSession,
) -> ReviewScanResponse:
    scan = await db.scalar(
        select(ReviewScan).where(
            ReviewScan.id == scan_id,
            ReviewScan.workspace_id == auth.workspace.id,
        )
    )
    if scan is None:
        raise DomainError(404, "scan_not_found", "扫描记录不存在")
    return scan


@router.get(
    "/scans/{scan_id}/findings",
    response_model=ReviewFindingsResponse,
)
async def get_scan_findings(
    scan_id: str,
    auth: Auth,
    db: DbSession,
) -> ReviewFindingsResponse:
    scan = await db.scalar(
        select(ReviewScan).where(
            ReviewScan.id == scan_id,
            ReviewScan.workspace_id == auth.workspace.id,
        )
    )
    if scan is None:
        raise DomainError(404, "scan_not_found", "扫描记录不存在")
    findings = await review_service.list_scan_findings(
        db,
        auth.workspace.id,
        scan_id,
    )
    return ReviewFindingsResponse(findings=findings)
