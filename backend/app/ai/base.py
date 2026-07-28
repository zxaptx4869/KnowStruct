"""AI Provider 抽象接口"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class OutlineNode:
    """AI 生成的目录节点"""
    title: str
    children: list["OutlineNode"] = field(default_factory=list)


@dataclass
class ExtractionResult:
    """AI 信息提取结果"""
    title: str
    content: str
    entry_type: str  # 经验 / 参数 / 避坑 / 商品 / 价格 / 决策 / 待办 / 疑问
    suggested_node_path: str | None = None
    key_params: dict | None = None
    risk_points: list[str] = field(default_factory=list)
    applicable_conditions: list[str] = field(default_factory=list)


@dataclass
class ReviewResult:
    """AI Review 结果"""
    review_type: str  # duplicate / conflict / missing / expired / risk
    description: str
    related_entry_ids: list[str] = field(default_factory=list)
    suggestion: str = ""
    severity: str = "info"  # info / warning / error


class AIProvider(ABC):
    """AI 能力统一接口"""

    @abstractmethod
    async def generate_outline(
        self, goal: str, context: str = ""
    ) -> list[OutlineNode]:
        """根据项目目标生成知识目录"""
        ...

    @abstractmethod
    async def extract_info(
        self, content: str, content_type: str = "text"
    ) -> ExtractionResult:
        """从文本/图片中提取关键信息"""
        ...

    @abstractmethod
    async def ocr(self, image_data: bytes) -> str:
        """图片 OCR 识别"""
        ...

    @abstractmethod
    async def suggest_archive(
        self, entry: dict, nodes: list[dict]
    ) -> list[dict]:
        """建议归档到哪些节点"""
        ...

    @abstractmethod
    async def review(self, entries: list[dict]) -> list[ReviewResult]:
        """审查：找重复、冲突、缺失"""
        ...

    @abstractmethod
    async def expand_node(
        self, node_title: str, context: str
    ) -> list[dict]:
        """基于节点内容拓展子节点建议"""
        ...
