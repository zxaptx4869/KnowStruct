import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.base import AIProviderNotConfiguredError, ReviewResult
from app.models import Entry, Project, ReviewAiFinding, ReviewScan
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
    assert fetched["id"] == scan["id"]
    assert fetched["status"] == "pending"


@pytest.mark.asyncio
async def test_list_scans_recent_first_with_started_at(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    first = await _start_scan(client, scope_type="workspace")
    await process_next_scan(db, ReviewFakeProvider())
    second = await _start_scan(client, scope_type="workspace")

    scans = (await client.get("/api/review/scans")).json()["scans"]
    assert [scan["id"] for scan in scans] == [second["id"], first["id"]]
    assert scans[1]["started_at"] is not None
    assert scans[0]["started_at"] is None


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

    await process_next_scan(db, ReviewFakeProvider())
    scan = await _start_scan(client, scope_type="workspace")
    assert scan["status"] == "pending"


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


@pytest.mark.asyncio
async def test_scan_produces_candidates_and_confirm_flow(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client)
    node = await _create_node(client, project["id"], "冰箱")
    entry_a, _ = await _accepted_entry(
        client,
        db,
        project_id=project["id"],
        node_id=node["id"],
        conditions=["底部散热"],
    )
    entry_b, _ = await _accepted_entry(
        client,
        db,
        project_id=project["id"],
        node_id=node["id"],
        title="零嵌冰箱侧边预留尺寸",
        content="零嵌冰箱侧边预留以安装图为准。",
        conditions=["底部散热"],
    )

    scan = await _start_scan(client, scope_type="workspace")
    provider = ReviewFakeProvider(results=[
        ReviewResult(
            review_type="duplicate",
            description="两条记录语义重复",
            related_entry_ids=[entry_a, entry_b],
            suggestion="建议合并为一条",
            severity="warning",
        ),
    ])
    assert await process_next_scan(db, provider) is True

    fetched = (await client.get(f"/api/review/scans/{scan['id']}")).json()
    assert fetched["status"] == "succeeded"
    assert fetched["findings_count"] == 1

    candidates = (
        await client.get(f"/api/review/scans/{scan['id']}/candidates")
    ).json()["candidates"]
    assert len(candidates) == 1
    candidate = candidates[0]
    assert candidate["review_type"] == "duplicate"
    assert candidate["description"] == "两条记录语义重复"
    assert candidate["severity"] == "warning"
    assert {candidate["entry_a"]["id"], candidate["entry_b"]["id"]} == {
        entry_a,
        entry_b,
    }
    assert candidate["entry_a"]["node_path"] == ["冰箱"]

    # 确认 → 进入待处理
    response = await client.post(
        f"/api/review/findings/ai/{candidate['id']}/decision",
        json={"decision": "confirmed"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "open"
    open_findings = (await client.get("/api/review/findings")).json()["findings"]
    ai_item = next(
        item for item in open_findings if item["target_type"] == "ai_finding"
    )
    assert ai_item["finding_type"] == "duplicate"
    assert ai_item["ai_description"] == "两条记录语义重复"
    assert " vs " in ai_item["title"]
    assert ai_item["entry_b_title"] in ("零嵌冰箱侧边预留尺寸", "散热方式决定侧边预留")

    # 解决 → 移出待处理；撤销 → 恢复
    path = (
        f"/api/review/findings/duplicate/ai_finding/"
        f"{candidate['id']}/resolution"
    )
    response = await client.post(path, json={"resolution": "resolved", "note": "已合并"})
    assert response.status_code == 200
    open_findings = (await client.get("/api/review/findings")).json()["findings"]
    assert not any(item["target_type"] == "ai_finding" for item in open_findings)
    handled = (
        await client.get("/api/review/findings", params={"status": "resolved"})
    ).json()["findings"]
    handled_ai = next(
        item for item in handled if item["target_type"] == "ai_finding"
    )
    assert handled_ai["note"] == "已合并"
    assert handled_ai["ai_description"] == "两条记录语义重复"
    assert (await client.delete(path)).json() == {"removed": True}
    open_findings = (await client.get("/api/review/findings")).json()["findings"]
    assert any(item["target_type"] == "ai_finding" for item in open_findings)


@pytest.mark.asyncio
async def test_decision_idempotent_and_transition_rules(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client)
    node = await _create_node(client, project["id"], "冰箱")
    entry_a, _ = await _accepted_entry(
        client, db, project_id=project["id"], node_id=node["id"]
    )
    entry_b, _ = await _accepted_entry(
        client,
        db,
        project_id=project["id"],
        node_id=node["id"],
        title="另一条相似记录",
        content="内容与第一条高度相似。",
    )
    scan = await _start_scan(client, scope_type="workspace")
    provider = ReviewFakeProvider(results=[
        ReviewResult(
            review_type="conflict",
            description="结论相互矛盾",
            related_entry_ids=[entry_a, entry_b],
            severity="error",
        ),
    ])
    await process_next_scan(db, provider)
    candidate = (
        await client.get(f"/api/review/scans/{scan['id']}/candidates")
    ).json()["candidates"][0]
    path = f"/api/review/findings/ai/{candidate['id']}/decision"

    assert (
        await client.post(path, json={"decision": "confirmed"})
    ).json()["status"] == "open"
    assert (
        await client.post(path, json={"decision": "confirmed"})
    ).json()["status"] == "open"
    response = await client.post(path, json={"decision": "rejected"})
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_rescan_dedupe_and_regenerate_after_reject(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client)
    node = await _create_node(client, project["id"], "冰箱")
    entry_a, _ = await _accepted_entry(
        client, db, project_id=project["id"], node_id=node["id"]
    )
    entry_b, _ = await _accepted_entry(
        client,
        db,
        project_id=project["id"],
        node_id=node["id"],
        title="重复候选记录",
        content="与第一条内容几乎一致。",
    )
    results = [
        ReviewResult(
            review_type="duplicate",
            description="重复",
            related_entry_ids=[entry_a, entry_b],
        )
    ]

    scan_1 = await _start_scan(client, scope_type="workspace")
    await process_next_scan(db, ReviewFakeProvider(results=results))
    candidates_1 = (
        await client.get(f"/api/review/scans/{scan_1['id']}/candidates")
    ).json()["candidates"]
    assert len(candidates_1) == 1

    scan_2 = await _start_scan(client, scope_type="workspace")
    await process_next_scan(db, ReviewFakeProvider(results=results))
    assert (
        await client.get(f"/api/review/scans/{scan_2['id']}")
    ).json()["findings_count"] == 0
    assert (
        await client.get(f"/api/review/scans/{scan_2['id']}/candidates")
    ).json()["candidates"] == []

    # 拒绝后可再次生成
    await client.post(
        f"/api/review/findings/ai/{candidates_1[0]['id']}/decision",
        json={"decision": "rejected"},
    )
    scan_3 = await _start_scan(client, scope_type="workspace")
    await process_next_scan(db, ReviewFakeProvider(results=results))
    candidates_3 = (
        await client.get(f"/api/review/scans/{scan_3['id']}/candidates")
    ).json()["candidates"]
    assert len(candidates_3) == 1


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
    await _accepted_entry(
        client,
        db,
        project_id=project["id"],
        node_id=node["id"],
    )
    scan = await _start_scan(client, scope_type="workspace")
    provider = ReviewFakeProvider(
        error=AIProviderNotConfiguredError("AI 服务未配置")
    )
    assert await process_next_scan(db, provider) is True
    fetched = (await client.get(f"/api/review/scans/{scan['id']}")).json()
    assert fetched["status"] == "failed"
    assert "AI 服务未配置" in fetched["last_error"]


@pytest.mark.asyncio
async def test_workspace_isolation_for_scans_and_decisions(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    workspace_id = await login_owner(client, db)
    async with db.begin():
        other_user = await create_account(db, "other", "another password 123")
        other_workspace_id = other_user.workspace.id

    scan = await _start_scan(client, scope_type="workspace")
    await process_next_scan(db, ReviewFakeProvider())
    assert (
        await client.get(f"/api/review/scans/{scan['id']}")
    ).status_code == 200

    # 其他工作区的扫描与候选不可见
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
        status="pending",
    )
    db.add(other_scan)
    await db.commit()
    assert (
        await client.get(f"/api/review/scans/{other_scan.id}")
    ).status_code == 404

    # 跨工作区候选决定按不存在处理
    foreign_finding = ReviewAiFinding(
        workspace_id=other_workspace_id,
        scan_id=other_scan.id,
        review_type="duplicate",
        entry_a_id=other_entry_a.id,
        entry_b_id=other_entry_b.id,
        description="外部发现",
        severity="info",
        status="candidate",
    )
    db.add(foreign_finding)
    await db.commit()
    response = await client.post(
        f"/api/review/findings/ai/{foreign_finding.id}/decision",
        json={"decision": "confirmed"},
    )
    assert response.status_code == 404

    assert workspace_id != other_workspace_id
