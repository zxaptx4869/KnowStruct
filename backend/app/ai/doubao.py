"""豆包视觉 AI Provider（火山方舟，OpenAI 兼容接口）。"""

import base64

from openai import AsyncOpenAI

from app.ai.base import (
    AIProvider,
    AIProviderError,
    ExtractionResult,
    OutlineNode,
    ReviewResult,
)
from app.ai.openai_compat import request_json_candidates

DOUBAO_DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"


def _sniff_mime(image_data: bytes) -> str:
    if image_data.startswith(b"\x89PNG"):
        return "image/png"
    if image_data[:4] == b"RIFF" and image_data[8:12] == b"WEBP":
        return "image/webp"
    return "image/jpeg"


class DoubaoProvider(AIProvider):
    """通过火山方舟 OpenAI 兼容接口调用豆包视觉 / 文本模型。"""

    def __init__(
        self,
        *,
        api_key: str,
        base_url: str,
        model: str,
    ) -> None:
        self.model = model
        self._client = AsyncOpenAI(api_key=api_key, base_url=base_url)

    async def extract_candidates(
        self,
        content: str,
        content_type: str = "text",
    ) -> list[ExtractionResult]:
        return await request_json_candidates(
            self._client,
            self.model,
            content,
            content_type,
        )

    async def ocr(self, image_data: bytes) -> str:
        mime = _sniff_mime(image_data)
        encoded = base64.b64encode(image_data).decode("ascii")
        try:
            response = await self._client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": "请识别图片中的所有文字并原样输出。"
                                "只输出识别出的文字，不要解释，不要添加标题。",
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:{mime};base64,{encoded}",
                                },
                            },
                        ],
                    }
                ],
                temperature=0.1,
            )
        except Exception as exc:
            raise AIProviderError(f"OCR 服务调用失败：{exc}") from exc

        text = (
            response.choices[0].message.content if response.choices else ""
        )
        return (text or "").strip()

    async def extract_info(
        self, content: str, content_type: str = "text"
    ) -> ExtractionResult:
        return (await self.extract_candidates(content, content_type))[0]

    async def generate_outline(
        self, goal: str, context: str = ""
    ) -> list[OutlineNode]:
        raise AIProviderError("AI 目录生成能力尚未实现")

    async def suggest_archive(
        self, entry: dict, nodes: list[dict]
    ) -> list[dict]:
        raise AIProviderError("AI 归档建议能力尚未实现")

    async def review(self, entries: list[dict]) -> list[ReviewResult]:
        raise AIProviderError("AI Review 能力尚未实现")

    async def expand_node(
        self, node_title: str, context: str
    ) -> list[dict]:
        raise AIProviderError("AI 节点拓展能力尚未实现")
