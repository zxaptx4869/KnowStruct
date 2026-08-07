import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.base import AIProviderNotConfiguredError, ReviewResult
from app.models import (
    Entry,
    Project,
    ReviewAiFinding,
    ReviewResolution,
    ReviewScan,
)
from app.services.accounts import create_account
from app.services.review_scan import SCAN_ENTRY_LIMIT
from app.services.task_worker import process_next_scan
from tests.fakes import FakeAIProvider
from tests.test_inbox_api import create_project, login_owner
from tests.test_node_entries import _accepted_entry, _create_node


class ReviewFakeProvider(FakeAIProvider):
    def __init__(
        self,
        *,
        results: list[ReviewResult] | None = None,
        error: Exception | None = None,
    ) -> None:
        super().__init__()
        self.results = results or []
        self.error = error
        self.review_calls: list[list[dict]] = []

    async def review(self, entries: list[dict]) -> list[ReviewResult]:
        self.review_calls.append(entries)
        if self.error is not None:
            raise self.error
        return list(self.results)


async def _start_scan(client: AsyncClient, **payload: object) -> dict:
    response = await client.post("/api/review/scans", json=payload)
    assert response.status_code == 200
    return response.json()


async def _seed_pair(
    client: AsyncClient,
    db: AsyncSession,
    project_id: str,
    node_id: str,
) -> tuple[str, str]:
    entry_a, _ = await _accepted_entry(
        client, db, project_id=project_id, node_id=node_id
    )
    entry_b, _ = await _accepted_entry(
        client,
        db,
        project_id=project_id,
        node_id=node_id,
        title="重复候选记录",
        content="与第一条内容几乎一致。",
    )
    return entry_a, entry_b


def _duplicate_result(entry_a: str, entry_b: str) -> list[ReviewResult]:
    return [
        ReviewResult(
            review_type="duplicate",
            description="重复",
            related_entry_ids=[entry_a, entry_b],
        )
    ]


async def _scan_and_find(client: AsyncClient, db: AsyncSession, **payload: object):
    scan = await _start_scan(client, **payload)
    await process_next_scan(db, ReviewFakeProvider())
    return scan


@pytest.mark.asyncio
async def test_start_scan_workspace_scope_and_status(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    scan = await _start_scan(client, scope_type="workspace")
    assert scan["status"] == "pending"
    assert scan["scope_type"] == "workspace"
    assert scan["scope_id"] is None
    fetched = (await client.get(f"/api/review/scans/{scan['id']}")).json()
    assert fetched["status"] == "pending"
    assert await process_next_scan(db, ReviewFakeProvider()) is True


@pytest.mark.asyncio
async def test_list_scans_with_details_and_pagination(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client)
    node = await _create_node(client, project["id"], "冰箱")
    other_node = await _create_node(client, project["id"], "台面")
    entry_a, entry_b = await _seed_pair(client, db, project["id"], node["id"])

    scan_1 = await _start_scan(client, scope_type="workspace")
    await process_next_scan(
        db,
        ReviewFakeProvider(results=_duplicate_result(entry_a, entry_b)),
    )
    open_findings = (await client.get("/api/review/findings")).json()["findings"]
    ai_item = next(
        item for item in open_findings if item["target_type"] == "ai_finding"
    )
    response = await client.post(
        f"/api/review/findings/duplicate/ai_finding/{ai_item['target_id']}/resolution",
        json={"resolution": "resolved"},
    )
    assert response.status_code == 200

    scan_2 = await _start_scan(
        client,
        scope_type="node",
        project_id=project["id"],
        node_id=other_node["id"],
    )
    await process_next_scan(db, ReviewFakeProvider())

    body = (await client.get("/api/review/scans", params={"limit": 10})).json()
    assert body["total"] == 2
    by_id = {item["id"]: item for item in body["scans"]}
    assert by_id[scan_1["id"]]["scope_name"] is None
    assert by_id[scan_1["id"]]["duration_seconds"] == 0
    assert by_id[scan_1["id"]]["decision_summary"] == {
        "resolved": 1,
        "rejected": 0,
        "pending": 0,
    }
    assert by_id[scan_2["id"]]["scope_name"] == "台面"
    assert by_id[scan_2["id"]]["decision_summary"] == {
        "resolved": 0,
        "rejected": 0,
        "pending": 0,
    }

    paged = (await client.get("/api/review/scans", params={"limit": 1})).json()
    assert paged["total"] == 2
    assert len(paged["scans"]) == 1
    paged_2 = (
        await client.get(
            "/api/review/scans",
            params={"limit": 1, "offset": 1},
        )
    ).json()
    assert len(paged_2["scans"]) == 1
    assert paged["scans"][0]["id"] != paged_2["scans"][0]["id"]


@pytest.mark.asyncio
async def test_start_scan_validates_scope(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client)
    node = await _create_node(client, project["id"], "冰箱")
    other_project = await create_project(client, name="另一个项目")
    other_node = await _create_node(client, other_project["id"], "台面")

    response = await client.post(
        "/api/review/scans",
        json={"scope_type": "project"},
    )
    assert response.status_code == 409
    response = await client.post(
        "/api/review/scans",
        json={"scope_type": "node", "project_id": project["id"]},
    )
    assert response.status_code == 409
    response = await client.post(
        "/api/review/scans",
        json={"scope_type": "project", "project_id": "missing"},
    )
    assert response.status_code == 404
    response = await client.post(
        "/api/review/scans",
        json={"scope_type": "node", "project_id": project["id"], "node_id": other_node["id"]},
    )
    assert response.status_code == 404

    scan = await _start_scan(
        client,
        scope_type="node",
        project_id=project["id"],
        node_id=node["id"],
    )
    assert scan["scope_id"] == node["id"]
    assert await process_next_scan(db, ReviewFakeProvider()) is True


@pytest.mark.asyncio
async def test_concurrent_scan_is_blocked(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    await _start_scan(client, scope_type="workspace")
    response = await client.post(
        "/api/review/scans",
        json={"scope_type": "workspace"},
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "scan_in_progress"
    assert await process_next_scan(db, ReviewFakeProvider()) is True
    scan = await _start_scan(client, scope_type="workspace")
    assert scan["status"] == "pending"
    assert await process_next_scan(db, ReviewFakeProvider()) is True


@pytest.mark.asyncio
async def test_scan_creates_open_findings_directly(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client)
    node = await _create_node(client, project["id"], "冰箱")
    entry_a, entry_b = await _seed_pair(client, db, project["id"], node["id"])
    scan = await _start_scan(client, scope_type="workspace")
    await process_next_scan(
        db,
        ReviewFakeProvider(results=_duplicate_result(entry_a, entry_b)),
    )

    fetched = (await client.get(f"/api/review/scans/{scan['id']}")).json()
    assert fetched["status"] == "succeeded"
    assert fetched["findings_count"] == 1
    assert fetched["skipped_rejected_count"] == 0
    open_findings = (await client.get("/api/review/findings")).json()["findings"]
    ai_item = next(
        item for item in open_findings if item["target_type"] == "ai_finding"
    )
    assert ai_item["finding_type"] == "duplicate"
    assert " vs " in ai_item["title"]


@pytest.mark.asyncio
async def test_three_states_resolve_reject_undo(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client)
    node = await _create_node(client, project["id"], "冰箱")
    entry_a, entry_b = await _seed_pair(client, db, project["id"], node["id"])
    await _start_scan(client, scope_type="workspace")
    await process_next_scan(
        db,
        ReviewFakeProvider(results=_duplicate_result(entry_a, entry_b)),
    )
    open_findings = (await client.get("/api/review/findings")).json()["findings"]
    ai_item = next(
        item for item in open_findings if item["target_type"] == "ai_finding"
    )
    path = (
        f"/api/review/findings/duplicate/ai_finding/"
        f"{ai_item['target_id']}/resolution"
    )

    # 已解决 → 已处理视图；撤销 → 待处理
    await client.post(path, json={"resolution": "resolved", "note": "已处理"})
    resolved = (
        await client.get("/api/review/findings", params={"status": "resolved"})
    ).json()["findings"]
    assert any(item["target_type"] == "ai_finding" for item in resolved)
    assert not any(
        item["target_type"] == "ai_finding"
        for item in (await client.get("/api/review/findings")).json()["findings"]
    )
    assert (await client.delete(path)).json() == {"removed": True}
    open_findings = (await client.get("/api/review/findings")).json()["findings"]
    assert any(item["target_type"] == "ai_finding" for item in open_findings)

    # 拒绝 → 已拒绝视图；恢复 → 待处理
    await client.post(path, json={"resolution": "rejected", "note": "不是问题"})
    rejected = (
        await client.get("/api/review/findings", params={"status": "rejected"})
    ).json()["findings"]
    assert any(item["target_type"] == "ai_finding" for item in rejected)
    assert not any(
        item["target_type"] == "ai_finding"
        for item in (await client.get("/api/review/findings")).json()["findings"]
    )
    assert (await client.delete(path)).json() == {"removed": True}
    open_findings = (await client.get("/api/review/findings")).json()["findings"]
    assert any(item["target_type"] == "ai_finding" for item in open_findings)


@pytest.mark.asyncio
async def test_rescan_dedupe_resurface_and_skip_rejected(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client)
    node = await _create_node(client, project["id"], "冰箱")
    entry_a, entry_b = await _seed_pair(client, db, project["id"], node["id"])
    results = _duplicate_result(entry_a, entry_b)

    # 首次扫描 → open
    await _start_scan(client, scope_type="workspace")
    await process_next_scan(db, ReviewFakeProvider(results=results))
    open_findings = (await client.get("/api/review/findings")).json()["findings"]
    ai_item = next(
        item for item in open_findings if item["target_type"] == "ai_finding"
    )
    path = (
        f"/api/review/findings/duplicate/ai_finding/"
        f"{ai_item['target_id']}/resolution"
    )

    # 待处理中重扫 → 不重复
    scan_2 = await _start_scan(client, scope_type="workspace")
    await process_next_scan(db, ReviewFakeProvider(results=results))
    assert (
        await client.get(f"/api/review/scans/{scan_2['id']}")
    ).json()["findings_count"] == 0

    # 已解决后重扫 → 重新浮现（resurfaced_count=1，处理记录清除）
    await client.post(path, json={"resolution": "resolved"})
    scan_3 = await _start_scan(client, scope_type="workspace")
    await process_next_scan(db, ReviewFakeProvider(results=results))
    fetched = (await client.get(f"/api/review/scans/{scan_3['id']}")).json()
    assert fetched["resurfaced_count"] == 1
    resolution_count = await db.scalar(
        select(func.count(ReviewResolution.id)).where(
            ReviewResolution.target_id == ai_item["target_id"]
        )
    )
    assert resolution_count == 0

    # 拒绝后重扫 → 跳过（skipped_rejected_count=1，仍是已拒绝）
    await client.post(path, json={"resolution": "rejected"})
    scan_4 = await _start_scan(client, scope_type="workspace")
    await process_next_scan(db, ReviewFakeProvider(results=results))
    fetched = (await client.get(f"/api/review/scans/{scan_4['id']}")).json()
    assert fetched["skipped_rejected_count"] == 1
    assert fetched["findings_count"] == 0
    open_findings = (await client.get("/api/review/findings")).json()["findings"]
    assert not any(item["target_type"] == "ai_finding" for item in open_findings)
    rejected = (
        await client.get("/api/review/findings", params={"status": "rejected"})
    ).json()["findings"]
    assert any(item["target_type"] == "ai_finding" for item in rejected)


@pytest.mark.asyncio
async def test_scan_truncation_flag(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    workspace_id = await login_owner(client, db)
    project = await create_project(client)
    for index in range(SCAN_ENTRY_LIMIT + 5):
        db.add(
            Entry(
                workspace_id=workspace_id,
                project_id=project["id"],
                entry_type="experience",
                title=f"批量记录 {index}",
                content=f"第 {index} 条批量记录内容",
                applicable_conditions=["条件"],
            )
        )
    await db.commit()

    scan = await _start_scan(client, scope_type="project", project_id=project["id"])
    await process_next_scan(db, ReviewFakeProvider())
    fetched = (await client.get(f"/api/review/scans/{scan['id']}")).json()
    assert fetched["status"] == "succeeded"
    assert fetched["truncated"] is True


@pytest.mark.asyncio
async def test_scan_failure_marks_failed(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client)
    node = await _create_node(client, project["id"], "冰箱")
    await _accepted_entry(client, db, project_id=project["id"], node_id=node["id"])
    scan = await _start_scan(client, scope_type="workspace")
    provider = ReviewFakeProvider(
        error=AIProviderNotConfiguredError("AI 服务未配置")
    )
    assert await process_next_scan(db, provider) is True
    fetched = (await client.get(f"/api/review/scans/{scan['id']}")).json()
    assert fetched["status"] == "failed"
    assert "AI 服务未配置" in fetched["last_error"]


@pytest.mark.asyncio
async def test_workspace_isolation(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    async with db.begin():
        other_user = await create_account(db, "other", "another password 123")
        other_workspace_id = other_user.workspace.id

    scan = await _start_scan(client, scope_type="workspace")
    await process_next_scan(db, ReviewFakeProvider())
    assert (
        await client.get(f"/api/review/scans/{scan['id']}")
    ).status_code == 200

    other_project = Project(workspace_id=other_workspace_id, name="其他项目")
    db.add(other_project)
    await db.flush()
    other_entry_a = Entry(
        workspace_id=other_workspace_id,
        project_id=other_project.id,
        entry_type="experience",
        title="外部记录 A",
        content="外部内容 A",
    )
    other_entry_b = Entry(
        workspace_id=other_workspace_id,
        project_id=other_project.id,
        entry_type="experience",
        title="外部记录 B",
        content="外部内容 B",
    )
    db.add_all([other_entry_a, other_entry_b])
    other_scan = ReviewScan(
        workspace_id=other_workspace_id,
        scope_type="workspace",
        status="succeeded",
    )
    db.add(other_scan)
    await db.flush()
    foreign_finding = ReviewAiFinding(
        workspace_id=other_workspace_id,
        scan_id=other_scan.id,
        review_type="duplicate",
        entry_a_id=other_entry_a.id,
        entry_b_id=other_entry_b.id,
        description="外部发现",
        severity="info",
        status="open",
    )
    db.add(foreign_finding)
    await db.commit()

    assert (
        await client.get(f"/api/review/scans/{other_scan.id}")
    ).status_code == 404
    response = await client.post(
        f"/api/review/findings/duplicate/ai_finding/{foreign_finding.id}/resolution",
        json={"resolution": "rejected"},
    )
    assert response.status_code == 404
