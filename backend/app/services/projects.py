"""Workspace-scoped project operations."""

from dataclasses import dataclass

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import ConflictError, ResourceNotFoundError
from app.models import Entry, Node, Project, Source
from app.schemas.projects import ProjectCreate, ProjectUpdate


@dataclass(frozen=True)
class ProjectWithCount:
    project: Project
    node_count: int


def scoped_project_query(workspace_id: str, project_id: str) -> Select[tuple[Project]]:
    return select(Project).where(
        Project.id == project_id,
        Project.workspace_id == workspace_id,
    )


async def get_project(
    db: AsyncSession,
    workspace_id: str,
    project_id: str,
    *,
    for_update: bool = False,
) -> Project:
    query = scoped_project_query(workspace_id, project_id)
    if for_update:
        query = query.with_for_update()
    project = await db.scalar(query)
    if project is None:
        raise ResourceNotFoundError("project")
    return project


async def list_projects(db: AsyncSession, workspace_id: str) -> list[ProjectWithCount]:
    node_count = (
        select(func.count(Node.id))
        .where(Node.project_id == Project.id)
        .correlate(Project)
        .scalar_subquery()
    )
    rows = await db.execute(
        select(Project, node_count.label("node_count"))
        .where(Project.workspace_id == workspace_id)
        .order_by(Project.updated_at.desc(), Project.id)
    )
    return [ProjectWithCount(project=row[0], node_count=int(row[1])) for row in rows.all()]


async def project_with_count(
    db: AsyncSession,
    workspace_id: str,
    project_id: str,
) -> ProjectWithCount:
    project = await get_project(db, workspace_id, project_id)
    count = await db.scalar(select(func.count(Node.id)).where(Node.project_id == project.id))
    return ProjectWithCount(project=project, node_count=int(count or 0))


async def create_project(
    db: AsyncSession,
    workspace_id: str,
    payload: ProjectCreate,
) -> Project:
    project = Project(workspace_id=workspace_id, **payload.model_dump())
    db.add(project)
    await db.flush()
    return project


async def update_project(
    db: AsyncSession,
    workspace_id: str,
    project_id: str,
    payload: ProjectUpdate,
) -> Project:
    project = await get_project(db, workspace_id, project_id, for_update=True)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(project, field, value)
    await db.flush()
    return project


async def count_project_content_references(db: AsyncSession, project_id: str) -> int:
    source_count = await db.scalar(
        select(func.count(Source.id)).where(Source.project_id == project_id)
    )
    entry_count = await db.scalar(
        select(func.count(Entry.id)).where(Entry.project_id == project_id)
    )
    return int(source_count or 0) + int(entry_count or 0)


async def delete_project(db: AsyncSession, workspace_id: str, project_id: str) -> None:
    project = await get_project(db, workspace_id, project_id, for_update=True)
    blockers = await count_project_content_references(db, project.id)
    if blockers:
        raise ConflictError(
            "project_has_protected_content",
            "项目包含受保护内容，无法删除",
            blocker_count=blockers,
        )
    await db.delete(project)
    await db.flush()
