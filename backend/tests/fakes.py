"""Fake AI Provider for deterministic tests."""

from app.ai.base import (
    AIProvider,
    AIProviderError,
    ExtractionResult,
    OutlineNode,
    ReviewResult,
)


def make_candidate(
    *,
    title: str = "零嵌冰箱散热方式",
    content: str = "零嵌冰箱需要先确认散热方式，再决定柜体侧边预留尺寸。",
    entry_type: str = "pitfall",
    suggested_node_path: str | None = "家具家电 / 大家电 / 冰箱",
    confidence: float = 0.9,
) -> ExtractionResult:
    return ExtractionResult(
        title=title,
        content=content,
        entry_type=entry_type,
        suggested_node_path=suggested_node_path,
        risk_points=[],
        applicable_conditions=["嵌入橱柜安装；以具体型号安装图为准。"],
        confidence=confidence,
    )


class FakeAIProvider(AIProvider):
    """可配置成功 / 空候选 / 抛错行为的测试替身。"""

    def __init__(
        self,
        *,
        candidates: list[ExtractionResult] | None = None,
        error: Exception | None = None,
    ) -> None:
        self.candidates = (
            candidates
            if candidates is not None
            else [make_candidate(), make_candidate(title="底部散热型号的安装余量", entry_type="parameter")]
        )
        self.error = error
        self.calls: list[tuple[str, str]] = []

    async def extract_candidates(
        self,
        content: str,
        content_type: str = "text",
    ) -> list[ExtractionResult]:
        self.calls.append((content, content_type))
        if self.error is not None:
            raise self.error
        if not self.candidates:
            raise AIProviderError("未生成有效候选，请重试")
        return list(self.candidates)

    async def extract_info(
        self, content: str, content_type: str = "text"
    ) -> ExtractionResult:
        results = await self.extract_candidates(content, content_type)
        return results[0]

    async def generate_outline(
        self, goal: str, context: str = ""
    ) -> list[OutlineNode]:
        raise AIProviderError("未实现")

    async def ocr(self, image_data: bytes) -> str:
        raise AIProviderError("未实现")

    async def suggest_archive(
        self, entry: dict, nodes: list[dict]
    ) -> list[dict]:
        raise AIProviderError("未实现")

    async def review(self, entries: list[dict]) -> list[ReviewResult]:
        raise AIProviderError("未实现")

    async def expand_node(
        self, node_title: str, context: str
    ) -> list[dict]:
        raise AIProviderError("未实现")
