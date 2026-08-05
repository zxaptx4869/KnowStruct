"""OCR 执行：配置的 AI Provider 优先，tesseract 本地兜底。"""

import asyncio
import shutil

from app.ai.base import AIProvider, AIProviderError


def tesseract_available() -> bool:
    return shutil.which("tesseract") is not None


async def _tesseract_ocr(image_data: bytes) -> str | None:
    if not tesseract_available():
        return None
    try:
        from io import BytesIO

        import pytesseract
        from PIL import Image

        def _run() -> str:
            text = pytesseract.image_to_string(
                Image.open(BytesIO(image_data)),
                lang="chi_sim+eng",
            )
            return text.strip()

        return await asyncio.to_thread(_run) or None
    except Exception:  # noqa: BLE001 - 兜底失败不阻塞主流程
        return None


async def run_ocr_with_fallback(
    provider: AIProvider,
    image_data: bytes,
) -> str:
    """OCR 文本；AI Provider 失败或空文本时回退 tesseract，仍失败抛可读错误。"""
    provider_error: Exception | None = None
    try:
        text = (await provider.ocr(image_data) or "").strip()
    except AIProviderError as exc:
        provider_error = exc
        text = ""

    if text:
        return text

    fallback = await _tesseract_ocr(image_data)
    if fallback:
        return fallback

    if provider_error is not None:
        raise AIProviderError(
            f"OCR 服务不可用：{provider_error}"
        ) from provider_error
    raise AIProviderError("未识别到文字，请更换清晰图片后重试")
