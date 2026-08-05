"""Deterministic demo AI Provider for local acceptance (AI_PROVIDER=demo)."""

from app.ai.base import (
    AIProvider,
    AIProviderError,
    ExtractionResult,
    OutlineNode,
    ReviewResult,
)


class DemoProvider(AIProvider):
    """从内容中生成两条固定结构的候选，仅供本地验收，不调用外部服务。"""

    def __init__(self) -> None:
        self._retried: set[str] = set()

    async def extract_candidates(
        self,
        content: str,
        content_type: str = "text",
    ) -> list[ExtractionResult]:
        if "FAILONCE" in content:
            key = content.strip()
            if key not in self._retried:
                self._retried.add(key)
                raise AIProviderError("模拟首次提取失败：请从失败步骤重试验证")
        snippet = content.strip().replace("\n", " ")[:120]
        return [
            ExtractionResult(
                title="零嵌冰箱散热方式决定预留尺寸",
                content=f"根据资料「{snippet}」，安装前需先确认散热方式（底部散热或两侧散热），再决定柜体预留尺寸。",
                entry_type="pitfall",
                suggested_node_path="家具家电 / 大家电 / 冰箱",
                risk_points=["只标注「零嵌」不代表侧边无需预留"],
                applicable_conditions=["嵌入橱柜安装；以具体型号安装图为准。"],
                confidence=0.88,
            ),
            ExtractionResult(
                title="设备型号与关键参数待补充",
                content=f"资料「{snippet}」中提到具体型号与参数，建议核对后补充品牌、型号与尺寸数值。",
                entry_type="parameter",
                suggested_node_path=None,
                risk_points=[],
                applicable_conditions=["以产品说明书为准。"],
                confidence=0.66,
            ),
        ]

    async def extract_info(
        self, content: str, content_type: str = "text"
    ) -> ExtractionResult:
        return (await self.extract_candidates(content, content_type))[0]

    async def generate_outline(
        self, goal: str, context: str = ""
    ) -> list[OutlineNode]:
        return [OutlineNode(title="家具家电")]

    async def ocr(self, image_data: bytes) -> str:
        raise NotImplementedError("demo provider 不提供 OCR")

    async def suggest_archive(
        self, entry: dict, nodes: list[dict]
    ) -> list[dict]:
        return []

    async def review(self, entries: list[dict]) -> list[ReviewResult]:
        return []

    async def expand_node(
        self, node_title: str, context: str
    ) -> list[dict]:
        return []
