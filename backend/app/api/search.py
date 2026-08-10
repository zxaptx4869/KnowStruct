"""Authenticated global search APIs."""

from fastapi import APIRouter, Query

from app.api.deps import Auth, DbSession
from app.schemas.search import SearchResponse
from app.services.search import search

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("", response_model=SearchResponse)
async def search_global(
    auth: Auth,
    db: DbSession,
    q: str = Query(default=""),
    project: str | None = Query(default=None),
    type: str | None = Query(default=None),
    node: str | None = Query(default=None),
) -> SearchResponse:
    data = await search(
        db,
        auth.workspace.id,
        q,
        project_id=project,
        entry_type=type,
        node_id=node,
    )
    return SearchResponse(entries=data.entries, sources=data.sources)
