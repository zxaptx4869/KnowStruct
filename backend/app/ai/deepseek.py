"""DeepSeek AI Provider (OpenAI-compatible SDK)."""

from openai import AsyncOpenAI

from app.ai.base import (
    AIProvider,
    AIProviderError,
    ClarifyResult,
    ExtractionResult,
    OutlineAction,
    OutlineNode,
    ReviewResult,
)
from app.ai.openai_compat import (
    request_json_candidates,
    request_json_clarify,
    request_json_intent,
    request_json_outline,
    request_json_refine,
    request_json_review,
)


class DeepSeekProvider(AIProvider):
    """通过 OpenAI 兼容接口调用 DeepSeek。"""

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

    async def extract_info(
        self, content: str, content_type: str = "text"
    ) -> ExtractionResult:
        candidates = await self.extract_candidates(content, content_type)
        return candidates[0]

    async def generate_outline(
        self, goal: str, context: str = ""
    ) -> list[OutlineNode]:
        return await request_json_outline(self._client, self.model, goal, context)

    async def draft_clarify(
        self, goal: str, context: str = ""
    ) -> ClarifyResult:
        return await request_json_clarify(self._client, self.model, goal, context)

    async def refine_outline(
        self,
        draft: list[dict],
        intent_note: str,
        instruction: str,
    ) -> list[OutlineAction]:
        return await request_json_refine(
            self._client,
            self.model,
            draft,
            intent_note,
            instruction,
        )

    async def summarize_intent(
        self, intent_note: str, instruction: str
    ) -> str:
        return await request_json_intent(
            self._client,
            self.model,
            intent_note,
            instruction,
        )

    async def ocr(self, image_data: bytes) -> str:
        raise AIProviderError("AI OCR 能力尚未实现")

    async def suggest_archive(
        self, entry: dict, nodes: list[dict]
    ) -> list[dict]:
        raise AIProviderError("AI 归档建议能力尚未实现")

    async def review(self, entries: list[dict]) -> list[ReviewResult]:
        return await request_json_review(self._client, self.model, entries)

    async def expand_node(
        self, node_title: str, context: str
    ) -> list[dict]:
        raise AIProviderError("AI 节点拓展能力尚未实现")
