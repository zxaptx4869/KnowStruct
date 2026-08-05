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
) -> SearchResponse:
    data = await search(db, auth.workspace.id, q)
    return SearchResponse(entries=data.entries, sources=data.sources)
