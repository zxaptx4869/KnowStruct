from io import BytesIO

import pytest
from httpx import AsyncClient
from PIL import Image
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ProcessingTask, Source, TaskStage, TaskStatus
from app.services.accounts import create_account
from tests.test_inbox_api import login_owner


def make_png(width: int = 200, height: int = 100) -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (width, height), "white").save(buffer, format="PNG")
    return buffer.getvalue()


async def upload_image(
    client: AsyncClient,
    *,
    files: list[tuple[str, str, str, bytes]] | None = None,
    **fields: str,
) -> dict:
    uploads = files or [("photo.png", "image/png", make_png())]
    payload = [
        ("files", (filename, data, content_type))
        for filename, content_type, data in uploads
    ]
    for key, value in fields.items():
        payload.append((key, (None, value)))
    response = await client.post("/api/inbox/sources/image", files=payload)
    return response


@pytest.mark.asyncio
async def test_upload_image_creates_source_with_ocr_task(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    response = await upload_image(client, note=" 晶蕾洗碗机截图 ")
    assert response.status_code == 201
    source = response.json()
    assert source["source_type"] == "image"
    assert source["title"] == "晶蕾洗碗机截图"
    assert source["content"] is None
    assert source["content_status"] == "saved"
    assert source["attachment"]["filename"] == "photo.png"
    assert source["attachment"]["content_type"] == "image/png"
    assert source["attachment"]["size"] > 0
    assert "/attachments/" in source["attachment"]["url"]
    assert len(source["attachments"]) == 1
    assert source["processing_state"] == "processing"
    assert source["task"]["stage"] == "ocr"

    stored = await db.scalar(select(Source).where(Source.id == source["id"]))
    assert stored is not None
    task = await db.scalar(
        select(ProcessingTask).where(ProcessingTask.source_id == source["id"])
    )
    assert task is not None
    assert task.stage == TaskStage.OCR.value
    assert task.status == TaskStatus.PENDING.value


@pytest.mark.asyncio
async def test_upload_image_without_note_uses_placeholder_title(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    response = await upload_image(client)
    assert response.status_code == 201
    source = response.json()
    assert source["title"] == "未命名记录"


@pytest.mark.asyncio
async def test_upload_multiple_images_creates_sorted_attachments(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    response = await upload_image(
        client,
        files=[
            ("first.png", "image/png", make_png(width=120, height=80)),
            ("second.png", "image/png", make_png(width=200, height=100)),
            ("third.png", "image/png", make_png(width=300, height=150)),
        ],
    )
    assert response.status_code == 201
    source = response.json()
    assert len(source["attachments"]) == 3
    assert [item["filename"] for item in source["attachments"]] == [
        "first.png",
        "second.png",
        "third.png",
    ]
    assert source["attachment"]["filename"] == "first.png"
    assert source["task"]["stage"] == "ocr"

    stored = await db.scalar(select(Source).where(Source.id == source["id"]))
    assert stored is not None


@pytest.mark.asyncio
async def test_source_list_includes_attachments(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    source = (await upload_image(client)).json()
    listed = (await client.get("/api/inbox/sources")).json()
    item = next(item for item in listed if item["id"] == source["id"])
    assert len(item["attachments"]) == 1
    assert item["attachment"]["filename"] == "photo.png"


@pytest.mark.asyncio
async def test_legacy_first_attachment_endpoint(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    source = (
        await upload_image(
            client,
            files=[
                ("first.png", "image/png", make_png()),
                ("second.png", "image/png", make_png()),
            ],
        )
    ).json()

    legacy = await client.get(f"/api/inbox/sources/{source['id']}/attachment")
    assert legacy.status_code == 200
    assert legacy.headers["content-type"] == "image/png"

    async with db.begin():
        await create_account(db, "other", "another valid password")
    await client.post(
        "/api/auth/login",
        json={"account": "other", "password": "another valid password"},
    )
    hidden = await client.get(f"/api/inbox/sources/{source['id']}/attachment")
    assert hidden.status_code == 404


@pytest.mark.asyncio
async def test_reject_batch_over_limit_or_with_invalid_member(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)

    too_many = await upload_image(
        client,
        files=[
            ("a.png", "image/png", make_png()),
            ("b.png", "image/png", make_png()),
            ("c.png", "image/png", make_png()),
            ("d.png", "image/png", make_png()),
        ],
    )
    assert too_many.status_code == 422
    assert "1-3" in too_many.json()["detail"]["message"]

    bad_member = await upload_image(
        client,
        files=[
            ("ok.png", "image/png", make_png()),
            ("bad.png", "image/png", b"not an image"),
        ],
    )
    assert bad_member.status_code == 422
    assert "第 2 张" in bad_member.json()["detail"]["message"]

    count = await db.scalar(select(func.count(Source.id)))
    assert count == 0


@pytest.mark.asyncio
async def test_upload_image_with_project(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = (
        await client.post("/api/projects", json={"name": "厨房电器"})
    ).json()
    response = await upload_image(client, project_id=project["id"])
    assert response.status_code == 201
    assert response.json()["project_id"] == project["id"]


@pytest.mark.asyncio
async def test_reject_invalid_image_uploads(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)

    empty = await upload_image(client, files=[("empty.png", "image/png", b"")])
    assert empty.status_code == 422

    wrong_type = await upload_image(
        client,
        files=[("bad.txt", "text/plain", b"not an image")],
    )
    assert wrong_type.status_code == 422

    oversized = await upload_image(
        client,
        files=[("big.png", "image/png", b"\x00" * (10 * 1024 * 1024 + 1))],
    )
    assert oversized.status_code == 422
    assert "10MB" in oversized.json()["detail"]["message"]

    huge_dimension = await upload_image(
        client,
        files=[("wide.png", "image/png", make_png(width=5000, height=100))],
    )
    assert huge_dimension.status_code == 422
    assert "4096" in huge_dimension.json()["detail"]["message"]

    count = await db.scalar(select(func.count(Source.id)))
    assert count == 0


@pytest.mark.asyncio
async def test_attachment_is_workspace_scoped(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    source = (await upload_image(client)).json()

    owned = await client.get(source["attachment"]["url"])
    assert owned.status_code == 200
    assert owned.headers["content-type"] == "image/png"

    async with db.begin():
        await create_account(db, "other", "another valid password")
    await client.post(
        "/api/auth/login",
        json={"account": "other", "password": "another valid password"},
    )
    hidden = await client.get(source["attachment"]["url"])
    assert hidden.status_code == 404


@pytest.mark.asyncio
async def test_image_upload_requires_authentication(client: AsyncClient) -> None:
    response = await upload_image(client)
    assert response.status_code == 401
