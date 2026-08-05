import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.base import AIProviderError
from app.ai.demo import DemoProvider
from app.models import Extraction, Source
from app.services.task_worker import process_next_task
from tests.fakes import FakeAIProvider
from tests.test_image_upload import make_png, upload_image
from tests.test_inbox_api import login_owner


class OcrFailingProvider(FakeAIProvider):
    async def ocr(self, image_data: bytes) -> str:
        raise AIProviderError("模拟 OCR 失败")


class ExtractOcrProvider(FakeAIProvider):
    async def ocr(self, image_data: bytes) -> str:
        return "识别文本：晶蕾烘干需手动勾选"


class FailSecondOcrProvider(FakeAIProvider):
    def __init__(self) -> None:
        super().__init__()
        self.calls = 0

    async def ocr(self, image_data: bytes) -> str:
        self.calls += 1
        if self.calls == 2:
            raise AIProviderError("第二张模拟失败")
        return "识别文本：第一张正常"


@pytest.mark.asyncio
async def test_ocr_pipeline_writes_content_then_extracts(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    source = (await upload_image(client)).json()

    processed = await process_next_task(db, DemoProvider())
    assert processed is True

    detail = (await client.get(f"/api/inbox/sources/{source['id']}")).json()
    assert detail["task"]["status"] == "succeeded"
    assert detail["task"]["stage"] == "ai_extraction"
    assert detail["content"].startswith("图 1：")
    assert "演示 OCR 识别文本" in detail["content"]
    assert detail["content_status"] == "saved"
    assert detail["title"].startswith("西门子晶蕾洗碗机使用注意事项")
    assert detail["title"] != "图片资料"
    assert detail["processing_state"] == "pending_confirm"
    assert len(detail["extractions"]) == 2


@pytest.mark.asyncio
async def test_ocr_merges_multiple_attachments_in_order(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    source = (
        await upload_image(
            client,
            files=[
                ("a.png", "image/png", make_png()),
                ("b.png", "image/png", make_png()),
            ],
        )
    ).json()

    await process_next_task(db, DemoProvider())
    detail = (await client.get(f"/api/inbox/sources/{source['id']}")).json()
    assert detail["task"]["status"] == "succeeded"
    assert detail["content"].startswith("图 1：")
    assert "图 2：" in detail["content"]
    assert detail["content"].count("演示 OCR 识别文本") == 2


@pytest.mark.asyncio
async def test_ocr_failure_on_second_attachment_marks_batch_failed(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    source = (
        await upload_image(
            client,
            files=[
                ("a.png", "image/png", make_png()),
                ("b.png", "image/png", make_png()),
            ],
        )
    ).json()

    await process_next_task(db, FailSecondOcrProvider())
    detail = (await client.get(f"/api/inbox/sources/{source['id']}")).json()
    assert detail["task"]["status"] == "failed"
    assert detail["task"]["stage"] == "ocr"
    assert "第 2 张" in detail["task"]["last_error"]
    assert detail["content"] is None

    await client.post(f"/api/inbox/sources/{source['id']}/retry")
    await process_next_task(db, DemoProvider())
    detail = (await client.get(f"/api/inbox/sources/{source['id']}")).json()
    assert detail["task"]["status"] == "succeeded"
    assert "图 1：" in detail["content"]
    assert "图 2：" in detail["content"]


@pytest.mark.asyncio
async def test_ocr_failure_keeps_attachment_and_retries_from_ocr(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    source = (await upload_image(client)).json()

    processed = await process_next_task(db, OcrFailingProvider())
    assert processed is True

    detail = (await client.get(f"/api/inbox/sources/{source['id']}")).json()
    assert detail["processing_state"] == "failed"
    assert detail["task"]["status"] == "failed"
    assert detail["task"]["stage"] == "ocr"
    assert "OCR" in detail["task"]["last_error"]
    assert detail["content"] is None
    assert "/attachments/" in detail["attachment"]["url"]

    retry = await client.post(f"/api/inbox/sources/{source['id']}/retry")
    assert retry.status_code == 200
    assert retry.json()["task"]["stage"] == "ocr"
    assert retry.json()["task"]["attempt_count"] == 2

    processed = await process_next_task(db, DemoProvider())
    assert processed is True
    detail = (await client.get(f"/api/inbox/sources/{source['id']}")).json()
    assert detail["task"]["status"] == "succeeded"
    assert detail["content"].startswith("图 1：")
    assert "演示 OCR 识别文本" in detail["content"]

    source_count = await db.scalar(select(func.count(Source.id)))
    assert source_count == 1


@pytest.mark.asyncio
async def test_ai_extraction_failure_retries_without_reocr(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    source = (await upload_image(client)).json()

    await process_next_task(
        db,
        ExtractOcrProvider(error=AIProviderError("提取失败")),
    )
    detail = (await client.get(f"/api/inbox/sources/{source['id']}")).json()
    assert detail["task"]["status"] == "failed"
    assert detail["task"]["stage"] == "ai_extraction"
    assert detail["content"] == "图 1：\n识别文本：晶蕾烘干需手动勾选"
    assert detail["title"] == "晶蕾烘干需手动勾选"

    # 失败后先不重试：提取失败时不应留下候选
    extractions = await db.scalar(select(func.count(Extraction.id)))
    assert extractions == 0
    # 结束会话快照：MySQL REPEATABLE READ 下避免读到重试提交前的旧状态
    await db.commit()

    await client.post(f"/api/inbox/sources/{source['id']}/retry")
    await process_next_task(db, ExtractOcrProvider())

    detail = (await client.get(f"/api/inbox/sources/{source['id']}")).json()
    assert detail["task"]["status"] == "succeeded"
    assert detail["content"] == "图 1：\n识别文本：晶蕾烘干需手动勾选"
    assert len(detail["extractions"]) == 2
