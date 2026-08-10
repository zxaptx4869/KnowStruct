"""AI Provider 抽象接口"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class OutlineNode:
    """AI 生成的目录节点"""
    title: str
    description: str | None = None
    children: list["OutlineNode"] = field(default_factory=list)


@dataclass
class ClarifyQuestion:
    """AI 生成的单轮澄清问题"""
    id: str
    text: str
    options: list[str] = field(default_factory=list)
    multiple: bool = False


@dataclass
class ClarifyResult:
    """信息充分性判断与澄清问题"""
    needs_more: bool
    questions: list[ClarifyQuestion] = field(default_factory=list)


@dataclass
class OutlineAction:
    """增量微调动作：add / rename / remove / move"""
    type: str
    path: list[str]
    name: str | None = None
    description: str | None = None
    to_parent_path: list[str] | None = None


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
    confidence: float | None = None


@dataclass
class ReviewResult:
    """AI Review 结果"""
    review_type: str  # duplicate / conflict / missing / expired / risk
    description: str
    related_entry_ids: list[str] = field(default_factory=list)
    suggestion: str = ""
    severity: str = "info"  # info / warning / error


class AIProviderError(Exception):
    """可重试的 AI Provider 调用或解析错误。"""


class AIProviderNotConfiguredError(AIProviderError):
    """AI Provider 未配置或配置无效。"""


class AIProvider(ABC):
    """AI 能力统一接口"""

    @abstractmethod
    async def generate_outline(
        self, goal: str, context: str = ""
    ) -> list[OutlineNode]:
        """根据项目目标生成知识目录"""
        ...

    async def draft_clarify(
        self, goal: str, context: str = ""
    ) -> ClarifyResult:
        """判断信息是否充足；不足时生成单轮澄清问题。"""
        raise AIProviderError("AI 澄清能力尚未实现")

    async def refine_outline(
        self,
        draft: list[dict],
        intent_note: str,
        instruction: str,
    ) -> list[OutlineAction]:
        """按用户意见对当前草稿做增量修改，未提及节点原样保留。"""
        raise AIProviderError("AI 增量调整能力尚未实现")

    async def summarize_intent(
        self, intent_note: str, instruction: str
    ) -> str:
        """把历史意图与本次意见浓缩成一段当前有效意图。"""
        raise AIProviderError("AI 意图浓缩能力尚未实现")

    @abstractmethod
    async def extract_info(
        self, content: str, content_type: str = "text"
    ) -> ExtractionResult:
        """从文本/图片中提取关键信息"""
        ...

    @abstractmethod
    async def extract_candidates(
        self, content: str, content_type: str = "text"
    ) -> list[ExtractionResult]:
        """生成多条待确认的提取候选。"""
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
