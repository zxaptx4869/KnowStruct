"""项目概要：基于目录节点结构生成画像，签名校验 + 懒重建。"""

import hashlib

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import AIProvider
from app.models import Node, Project
from app.services.inbox import project_directory_paths, utc_now


async def project_structure_signature(
    db: AsyncSession,
    project_id: str,
) -> str | None:
    """节点结构签名（排除排序）：改名/增删/说明变化会改变签名。"""
    nodes = list(
        (
            await db.scalars(
                select(Node).where(Node.project_id == project_id)
            )
        ).all()
    )
    if not nodes:
        return None
    parts = sorted(
        f"{node.parent_id or ''}|{node.name}|{node.description or ''}|{node.id}"
        for node in nodes
    )
    return hashlib.sha1("\n".join(parts).encode("utf-8")).hexdigest()


async def generate_project_summary(
    db: AsyncSession,
    project: Project,
    provider: AIProvider,
) -> bool:
    """调用 AI 生成项目概要并落库（含签名）；失败降级返回 False。"""
    nodes_text = await project_directory_paths(db, project.id)
    if not nodes_text:
        return False
    try:
        summary = await provider.summarize_project(project.name, nodes_text)
    except Exception:  # noqa: BLE001 - 生成失败降级，下次重建再试
        return False
    project.summary = summary
    project.summary_signature = await project_structure_signature(
        db,
        project.id,
    )
    project.summary_updated_at = utc_now()
    return True


async def rebuild_one_stale_summary(
    db: AsyncSession,
) -> bool:
    """重建一个概要缺失或结构过期的项目；返回是否处理了项目。"""
    projects = list(
        (
            await db.scalars(
                select(Project).order_by(Project.created_at, Project.id)
            )
        ).all()
    )
    for project in projects:
        signature = await project_structure_signature(db, project.id)
        if signature is None:
            continue
        if (
            project.summary
            and project.summary_signature == signature
        ):
            continue
        try:
            from app.ai import get_ai_provider

            provider = await get_ai_provider(db, project.workspace_id)
        except Exception:  # noqa: BLE001 - Provider 未配置，留待下次重建
            return False
        if await generate_project_summary(db, project, provider):
            await db.commit()
            return True
    await db.commit()
    return False
