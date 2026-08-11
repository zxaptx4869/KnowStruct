"""AI 目录起草 API：草稿生命周期、澄清、会话式微调与确认。"""

from fastapi import APIRouter, status

from app.ai import get_ai_provider
from app.api.deps import Auth, DbSession
from app.schemas.directory_draft import (
    ClarifySubmit,
    DraftChatResponse,
    DraftConfirmRequest,
    DraftConfirmResponse,
    DraftCreate,
    DraftEnvelope,
    DraftMessageResponse,
    DraftNodeEdit,
    DraftNodeResponse,
    DraftResponse,
    MessageSubmit,
    RedraftSubmit,
)
from app.services.directory_draft import (
    confirm_draft,
    create_draft,
    delete_draft_node,
    discard_draft,
    draft_payload,
    edit_draft_node,
    get_active_draft,
    get_draft,
    redraft,
    retry_draft,
    submit_clarify_answers,
    submit_draft_message,
)

router = APIRouter(
    prefix="/api/projects/{project_id}/drafts",
    tags=["directory-drafts"],
)


async def _response(
    db: DbSession,
    workspace_id: str,
    project_id: str,
    draft_id: str,
) -> DraftResponse:
    draft = await get_draft(db, workspace_id, project_id, draft_id)
    return DraftResponse.model_validate(await draft_payload(db, draft))


@router.get("", response_model=DraftEnvelope)
async def draft_detail(
    project_id: str,
    auth: Auth,
    db: DbSession,
) -> DraftEnvelope:
    draft = await get_active_draft(db, auth.workspace.id, project_id)
    if draft is None:
        return DraftEnvelope(draft=None)
    return DraftEnvelope(
        draft=DraftResponse.model_validate(await draft_payload(db, draft))
    )


@router.post(
    "",
    response_model=DraftResponse,
    status_code=status.HTTP_201_CREATED,
)
async def draft_create(
    project_id: str,
    payload: DraftCreate,
    auth: Auth,
    db: DbSession,
) -> DraftResponse:
    draft = await create_draft(
        db,
        auth.workspace.id,
        project_id,
        background=payload.background,
        target_node_id=payload.target_node_id,
    )
    await db.commit()
    return DraftResponse.model_validate(await draft_payload(db, draft))


@router.post("/{draft_id}/clarify", response_model=DraftResponse)
async def draft_clarify(
    project_id: str,
    draft_id: str,
    payload: ClarifySubmit,
    auth: Auth,
    db: DbSession,
) -> DraftResponse:
    draft = await submit_clarify_answers(
        db,
        auth.workspace.id,
        project_id,
        draft_id,
        payload.answers,
    )
    await db.commit()
    return DraftResponse.model_validate(await draft_payload(db, draft))


@router.post("/{draft_id}/messages", response_model=DraftChatResponse)
async def draft_message(
    project_id: str,
    draft_id: str,
    payload: MessageSubmit,
    auth: Auth,
    db: DbSession,
) -> DraftChatResponse:
    provider = await get_ai_provider(db, auth.workspace.id)
    draft, messages = await submit_draft_message(
        db,
        auth.workspace.id,
        project_id,
        draft_id,
        payload.content,
        provider,
    )
    await db.commit()
    return DraftChatResponse(
        draft=DraftResponse.model_validate(await draft_payload(db, draft)),
        messages=[
            DraftMessageResponse.model_validate(message)
            for message in messages
        ],
    )


@router.post("/{draft_id}/redraft", response_model=DraftResponse)
async def draft_redraft(
    project_id: str,
    draft_id: str,
    payload: RedraftSubmit,
    auth: Auth,
    db: DbSession,
) -> DraftResponse:
    draft = await redraft(
        db,
        auth.workspace.id,
        project_id,
        draft_id,
        background=payload.background,
    )
    await db.commit()
    return DraftResponse.model_validate(await draft_payload(db, draft))


@router.post("/{draft_id}/retry", response_model=DraftResponse)
async def draft_retry(
    project_id: str,
    draft_id: str,
    auth: Auth,
    db: DbSession,
) -> DraftResponse:
    draft = await retry_draft(db, auth.workspace.id, project_id, draft_id)
    await db.commit()
    return DraftResponse.model_validate(await draft_payload(db, draft))


@router.post("/{draft_id}/discard", response_model=DraftResponse)
async def draft_discard(
    project_id: str,
    draft_id: str,
    auth: Auth,
    db: DbSession,
) -> DraftResponse:
    draft = await discard_draft(db, auth.workspace.id, project_id, draft_id)
    await db.commit()
    return DraftResponse.model_validate(await draft_payload(db, draft))


@router.post("/{draft_id}/confirm", response_model=DraftConfirmResponse)
async def draft_confirm(
    project_id: str,
    draft_id: str,
    auth: Auth,
    db: DbSession,
    payload: DraftConfirmRequest | None = None,
) -> DraftConfirmResponse:
    draft, created_count = await confirm_draft(
        db,
        auth.workspace.id,
        project_id,
        draft_id,
        removed_node_ids=(
            payload.removed_node_ids if payload is not None else []
        ),
    )
    await db.commit()
    return DraftConfirmResponse(
        created_count=created_count,
        status=draft.status,
    )


@router.patch(
    "/{draft_id}/nodes/{node_id}",
    response_model=DraftNodeResponse,
)
async def draft_node_edit(
    project_id: str,
    draft_id: str,
    node_id: str,
    payload: DraftNodeEdit,
    auth: Auth,
    db: DbSession,
) -> DraftNodeResponse:
    node = await edit_draft_node(
        db,
        auth.workspace.id,
        project_id,
        draft_id,
        node_id,
        name=payload.name,
        selected=payload.selected,
    )
    await db.commit()
    await db.refresh(node)
    return DraftNodeResponse.model_validate(node)


@router.delete(
    "/{draft_id}/nodes/{node_id}",
    response_model=DraftResponse,
)
async def draft_node_delete(
    project_id: str,
    draft_id: str,
    node_id: str,
    auth: Auth,
    db: DbSession,
) -> DraftResponse:
    draft = await delete_draft_node(
        db,
        auth.workspace.id,
        project_id,
        draft_id,
        node_id,
    )
    await db.commit()
    return DraftResponse.model_validate(await draft_payload(db, draft))
