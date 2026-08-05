"""Authenticated capture inbox APIs."""

from fastapi import APIRouter, status

from app.api.deps import Auth, DbSession
from app.schemas.inbox import (
    CompleteResponse,
    DecideRequest,
    DecideResponse,
    EntrySummary,
    SourceCreate,
    SourceDetailResponse,
    SourceListItem,
    TaskInfo,
)
from app.services.confirmation import complete_source, decide_extraction
from app.services.inbox import (
    SourceDetailData,
    SourceListItemData,
    create_source,
    derive_processing_state,
    get_source_detail,
    list_sources,
    retry_source_task,
)

router = APIRouter(prefix="/api/inbox", tags=["inbox"])


def _list_item(item: SourceListItemData) -> SourceListItem:
    return SourceListItem(
        id=item.source.id,
        source_type=item.source.source_type,
        title=item.source.title,
        content=item.source.content,
        link_url=item.source.link_url,
        content_status=item.source.content_status,
        project_id=item.source.project_id,
        project_name=item.project_name,
        processing_state=derive_processing_state(item.task, item.counts),
        candidates=item.counts,
        task=TaskInfo.model_validate(item.task) if item.task else None,
        created_at=item.source.created_at,
        updated_at=item.source.updated_at,
    )


def _detail_response(item: SourceDetailData) -> SourceDetailResponse:
    from app.schemas.inbox import ExtractionResponse

    base = _list_item(item)
    return SourceDetailResponse(
        **base.model_dump(),
        extractions=[
            ExtractionResponse.model_validate(extraction)
            for extraction in item.extractions
        ],
    )


@router.post(
    "/sources",
    response_model=SourceDetailResponse,
    status_code=status.HTTP_201_CREATED,
)
async def source_create(
    payload: SourceCreate,
    auth: Auth,
    db: DbSession,
) -> SourceDetailResponse:
    source = await create_source(db, auth.workspace.id, payload)
    await db.commit()
    return _detail_response(
        await get_source_detail(db, auth.workspace.id, source.id)
    )


@router.get("/sources", response_model=list[SourceListItem])
async def source_list(
    auth: Auth,
    db: DbSession,
    state: str | None = None,
    source_type: str | None = None,
    project_id: str | None = None,
    q: str | None = None,
) -> list[SourceListItem]:
    items = await list_sources(
        db,
        auth.workspace.id,
        state=state,
        source_type=source_type,
        project_id=project_id,
        q=q,
    )
    return [_list_item(item) for item in items]


@router.get("/sources/{source_id}", response_model=SourceDetailResponse)
async def source_detail(
    source_id: str,
    auth: Auth,
    db: DbSession,
) -> SourceDetailResponse:
    return _detail_response(
        await get_source_detail(db, auth.workspace.id, source_id)
    )


@router.post(
    "/sources/{source_id}/retry",
    response_model=SourceDetailResponse,
)
async def source_retry(
    source_id: str,
    auth: Auth,
    db: DbSession,
) -> SourceDetailResponse:
    source = await retry_source_task(db, auth.workspace.id, source_id)
    await db.commit()
    return _detail_response(
        await get_source_detail(db, auth.workspace.id, source.id)
    )


@router.post(
    "/sources/{source_id}/extractions/{extraction_id}/decide",
    response_model=DecideResponse,
)
async def extraction_decide(
    source_id: str,
    extraction_id: str,
    payload: DecideRequest,
    auth: Auth,
    db: DbSession,
) -> DecideResponse:
    extraction, entry = await decide_extraction(
        db,
        auth.workspace.id,
        source_id,
        extraction_id,
        payload,
    )
    await db.commit()
    if entry is not None:
        await db.refresh(entry)
    return DecideResponse(
        decision=extraction.status,
        extraction_id=extraction.id,
        entry=EntrySummary.model_validate(entry) if entry else None,
    )


@router.post(
    "/sources/{source_id}/complete",
    response_model=CompleteResponse,
)
async def source_complete(
    source_id: str,
    auth: Auth,
    db: DbSession,
) -> CompleteResponse:
    data = await complete_source(db, auth.workspace.id, source_id)
    return CompleteResponse(
        total=data.total,
        pending_confirm=data.pending_confirm,
        accepted=data.accepted,
        rejected=data.rejected,
        completed=data.completed,
    )
