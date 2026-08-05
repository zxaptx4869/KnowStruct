"""Authenticated capture inbox APIs."""

import io
from urllib.parse import quote

from fastapi import APIRouter, File, Form, Response, UploadFile, status
from PIL import Image

from app.api.deps import Auth, DbSession
from app.api.errors import DomainError, ResourceNotFoundError
from app.config import get_settings
from app.schemas.inbox import (
    AttachmentInfo,
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
    create_image_source,
    create_source,
    derive_processing_state,
    get_source_detail,
    list_sources,
    retry_source_task,
)
from app.services.storage import get_attachment_storage

router = APIRouter(prefix="/api/inbox", tags=["inbox"])

_ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}


def _sniff_content_type(data: bytes) -> str | None:
    if data.startswith(b"\x89PNG"):
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    return None


def _list_item(item: SourceListItemData) -> SourceListItem:
    attachment = None
    if item.source.attachment_object_key:
        attachment = AttachmentInfo(
            filename=item.source.attachment_filename or "",
            content_type=(
                item.source.attachment_content_type
                or "application/octet-stream"
            ),
            size=item.source.attachment_size or 0,
            url=f"/api/inbox/sources/{item.source.id}/attachment",
        )
    return SourceListItem(
        id=item.source.id,
        source_type=item.source.source_type,
        title=item.source.title,
        content=item.source.content,
        link_url=item.source.link_url,
        attachment=attachment,
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


@router.post(
    "/sources/image",
    response_model=SourceDetailResponse,
    status_code=status.HTTP_201_CREATED,
)
async def source_create_image(
    auth: Auth,
    db: DbSession,
    file: UploadFile = File(...),  # noqa: B008
    project_id: str | None = Form(default=None),
    note: str | None = Form(default=None),
) -> SourceDetailResponse:
    settings = get_settings()
    data = await file.read()
    if not data:
        raise DomainError(422, "invalid_image", "图片文件为空")
    if len(data) > settings.MAX_IMAGE_UPLOAD_BYTES:
        limit_mb = settings.MAX_IMAGE_UPLOAD_BYTES // (1024 * 1024)
        raise DomainError(422, "invalid_image", f"图片大小不能超过 {limit_mb}MB")

    declared = (file.content_type or "").lower()
    content_type = (
        declared if declared in _ALLOWED_IMAGE_TYPES else _sniff_content_type(data)
    )
    if content_type is None:
        raise DomainError(422, "invalid_image", "仅支持 JPG、PNG、WebP 图片")
    try:
        with Image.open(io.BytesIO(data)) as image:
            width, height = image.size
    except Exception:  # noqa: BLE001 - 图片解析失败统一返回验证错误
        raise DomainError(422, "invalid_image", "图片无法解析，请更换文件")
    if width > settings.MAX_IMAGE_DIMENSION or height > settings.MAX_IMAGE_DIMENSION:
        raise DomainError(
            422,
            "invalid_image",
            f"图片宽高不能超过 {settings.MAX_IMAGE_DIMENSION}px",
        )

    source = await create_image_source(
        db,
        auth.workspace.id,
        project_id=project_id or None,
        note=note or None,
        filename=file.filename or "image",
        content_type=content_type,
        data=data,
    )
    await db.commit()
    return _detail_response(
        await get_source_detail(db, auth.workspace.id, source.id)
    )


@router.get("/sources/{source_id}/attachment")
async def source_attachment(
    source_id: str,
    auth: Auth,
    db: DbSession,
) -> Response:
    detail = await get_source_detail(db, auth.workspace.id, source_id)
    source = detail.source
    if not source.attachment_object_key or not source.attachment_content_type:
        raise ResourceNotFoundError("attachment")
    storage = get_attachment_storage()
    data = await storage.read(
        workspace_id=auth.workspace.id,
        source_id=source.id,
        object_key=source.attachment_object_key,
    )
    if data is None:
        raise ResourceNotFoundError("attachment")
    filename = quote(source.attachment_filename or "image")
    return Response(
        content=data,
        media_type=source.attachment_content_type,
        headers={
            "Cache-Control": "private, max-age=300",
            "Content-Disposition": f'inline; filename="{filename}"',
        },
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
