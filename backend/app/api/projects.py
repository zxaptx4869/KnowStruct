"""Authenticated project and knowledge-directory APIs."""

from fastapi import APIRouter, Response, status

from app.api.deps import Auth, DbSession
from app.schemas.projects import (
    EntryUpdate,
    NodeCreate,
    NodeDeleteResponse,
    NodeEntryResponse,
    NodeMove,
    NodeResponse,
    NodeUpdate,
    ProjectCreate,
    ProjectResponse,
    ProjectUpdate,
)
from app.services.entries import (
    delete_entry,
    entry_counts_by_node,
    list_node_entries,
    update_entry,
)
from app.services.nodes import (
    create_node,
    delete_node_subtree,
    list_nodes,
    move_node,
    update_node,
)
from app.services.projects import (
    ProjectWithCount,
    create_project,
    delete_project,
    list_projects,
    project_with_count,
    update_project,
)

router = APIRouter(prefix="/api/projects", tags=["projects"])


def project_response(item: ProjectWithCount) -> ProjectResponse:
    response = ProjectResponse.model_validate(item.project)
    return response.model_copy(update={"node_count": item.node_count})


@router.get("", response_model=list[ProjectResponse])
async def project_list(auth: Auth, db: DbSession) -> list[ProjectResponse]:
    projects = await list_projects(db, auth.workspace.id)
    return [project_response(item) for item in projects]


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def project_create(
    payload: ProjectCreate,
    auth: Auth,
    db: DbSession,
) -> ProjectResponse:
    project = await create_project(db, auth.workspace.id, payload)
    await db.commit()
    await db.refresh(project)
    return project_response(ProjectWithCount(project, 0))


@router.get("/{project_id}", response_model=ProjectResponse)
async def project_detail(project_id: str, auth: Auth, db: DbSession) -> ProjectResponse:
    return project_response(await project_with_count(db, auth.workspace.id, project_id))


@router.patch("/{project_id}", response_model=ProjectResponse)
async def project_update(
    project_id: str,
    payload: ProjectUpdate,
    auth: Auth,
    db: DbSession,
) -> ProjectResponse:
    project = await update_project(db, auth.workspace.id, project_id, payload)
    await db.commit()
    await db.refresh(project)
    return project_response(await project_with_count(db, auth.workspace.id, project.id))


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def project_delete(project_id: str, auth: Auth, db: DbSession) -> Response:
    await delete_project(db, auth.workspace.id, project_id)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{project_id}/nodes", response_model=list[NodeResponse])
async def node_list(project_id: str, auth: Auth, db: DbSession) -> list[NodeResponse]:
    _, nodes = await list_nodes(db, auth.workspace.id, project_id)
    counts = await entry_counts_by_node(
        db,
        auth.workspace.id,
        [node.id for node in nodes],
    )
    return [
        NodeResponse.model_validate(node).model_copy(
            update={"entry_count": counts.get(node.id, 0)}
        )
        for node in nodes
    ]


@router.get(
    "/{project_id}/nodes/{node_id}/entries",
    response_model=list[NodeEntryResponse],
)
async def node_entries(
    project_id: str,
    node_id: str,
    auth: Auth,
    db: DbSession,
) -> list[NodeEntryResponse]:
    return await list_node_entries(db, auth.workspace.id, project_id, node_id)


@router.patch("/{project_id}/entries/{entry_id}", response_model=NodeEntryResponse)
async def entry_update(
    project_id: str,
    entry_id: str,
    payload: EntryUpdate,
    auth: Auth,
    db: DbSession,
) -> NodeEntryResponse:
    response = await update_entry(
        db,
        auth.workspace.id,
        project_id,
        entry_id,
        payload,
    )
    await db.commit()
    return response


@router.delete(
    "/{project_id}/entries/{entry_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def entry_delete(
    project_id: str,
    entry_id: str,
    auth: Auth,
    db: DbSession,
) -> Response:
    await delete_entry(db, auth.workspace.id, project_id, entry_id)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{project_id}/nodes",
    response_model=NodeResponse,
    status_code=status.HTTP_201_CREATED,
)
async def node_create(
    project_id: str,
    payload: NodeCreate,
    auth: Auth,
    db: DbSession,
) -> NodeResponse:
    node = await create_node(db, auth.workspace.id, project_id, payload)
    await db.commit()
    await db.refresh(node)
    return NodeResponse.model_validate(node)


@router.patch("/{project_id}/nodes/{node_id}", response_model=NodeResponse)
async def node_update(
    project_id: str,
    node_id: str,
    payload: NodeUpdate,
    auth: Auth,
    db: DbSession,
) -> NodeResponse:
    node = await update_node(db, auth.workspace.id, project_id, node_id, payload)
    await db.commit()
    await db.refresh(node)
    return NodeResponse.model_validate(node)


@router.post("/{project_id}/nodes/{node_id}/move", response_model=NodeResponse)
async def node_move(
    project_id: str,
    node_id: str,
    payload: NodeMove,
    auth: Auth,
    db: DbSession,
) -> NodeResponse:
    node = await move_node(db, auth.workspace.id, project_id, node_id, payload)
    await db.commit()
    await db.refresh(node)
    return NodeResponse.model_validate(node)


@router.delete(
    "/{project_id}/nodes/{node_id}",
    response_model=NodeDeleteResponse,
)
async def node_delete(
    project_id: str,
    node_id: str,
    auth: Auth,
    db: DbSession,
) -> NodeDeleteResponse:
    deleted_count, parent_id = await delete_node_subtree(
        db,
        auth.workspace.id,
        project_id,
        node_id,
    )
    await db.commit()
    return NodeDeleteResponse(deleted_count=deleted_count, parent_id=parent_id)
