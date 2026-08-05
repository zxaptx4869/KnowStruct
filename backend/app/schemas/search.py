"""Global search request/response schemas."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SourceRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    source_type: str
    title: str


class EntryHit(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    entry_type: str
    title: str
    content: str
    project_id: str
    project_name: str
    node_id: str | None
    node_path: list[str]
    sources: list[SourceRef]
    created_at: datetime


class SourceHit(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    source_type: str
    title: str
    content: str | None
    link_url: str | None
    project_id: str | None
    project_name: str | None
    entry_count: int
    created_at: datetime


class SearchResponse(BaseModel):
    entries: list[EntryHit]
    sources: list[SourceHit]
