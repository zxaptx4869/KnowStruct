import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Node, Project, Workspace
from app.schemas.projects import NodeCreate, ProjectCreate
from app.services.accounts import create_account
from app.services.nodes import create_node
from app.services.projects import create_project


@pytest.mark.asyncio
async def test_project_defaults_and_directory_constraints(db: AsyncSession) -> None:
    async with db.begin():
        user = await create_account(db, "owner", "correct horse battery")
        project = await create_project(db, user.workspace.id, ProjectCreate(name="新房装修"))
        root = await create_node(
            db,
            user.workspace.id,
            project.id,
            NodeCreate(name="家具家电"),
        )
        child = await create_node(
            db,
            user.workspace.id,
            project.id,
            NodeCreate(name="冰箱", parent_id=root.id),
        )

    assert project.status == "planning"
    assert root.sort_order == child.sort_order == 0
    assert root.sibling_scope == f"project:{project.id}"
    assert child.sibling_scope == f"node:{root.id}"

    with pytest.raises(IntegrityError):
        async with db.begin():
            db.add(
                Node(
                    project_id=project.id,
                    parent_id=root.id,
                    sibling_scope=f"node:{root.id}",
                    name="冰箱",
                    normalized_name="冰箱",
                    sort_order=1,
                )
            )


@pytest.mark.asyncio
async def test_database_rejects_invalid_project_status(db: AsyncSession) -> None:
    async with db.begin():
        user = await create_account(db, "owner", "correct horse battery")

    with pytest.raises(IntegrityError):
        async with db.begin():
            db.add(Project(workspace_id=user.workspace.id, name="无效项目", status="archived"))


@pytest.mark.asyncio
async def test_workspace_delete_cascades_projects_and_nodes(db: AsyncSession) -> None:
    async with db.begin():
        user = await create_account(db, "owner", "correct horse battery")
        workspace_id = user.workspace.id
        project = await create_project(db, workspace_id, ProjectCreate(name="新房装修"))
        await create_node(db, workspace_id, project.id, NodeCreate(name="硬装施工"))

    async with db.begin():
        workspace = await db.get(Workspace, workspace_id)
        assert workspace is not None
        await db.delete(workspace)

    assert await db.scalar(select(func.count()).select_from(Project)) == 0
    assert await db.scalar(select(func.count()).select_from(Node)) == 0
