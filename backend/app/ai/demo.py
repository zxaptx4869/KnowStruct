"""Deterministic demo AI Provider for local acceptance (AI_PROVIDER=demo)."""

import copy
import re
from typing import ClassVar

from app.ai.base import (
    AIProvider,
    AIProviderError,
    ChatRoundResult,
    ClarifyQuestion,
    ClarifyResult,
    ExtractionResult,
    OutlineNode,
    ReviewResult,
)


class DemoProvider(AIProvider):
    """从内容中生成两条固定结构的候选，仅供本地验收，不调用外部服务。"""

    _USAGE_KEYWORDS = (
        "注意",
        "使用",
        "经验",
        "默认",
        "勾选",
        "设置",
        "需要",
        "记得",
        "建议",
        "避免",
        "别忘",
        "操作",
        "按钮",
        "模式",
    )
    _DEVICE_PATHS: ClassVar[dict[str, str]] = {
        "洗碗机": "家具家电 / 大家电 / 洗碗机",
        "冰箱": "家具家电 / 大家电 / 冰箱",
        "洗衣机": "家具家电 / 大家电 / 洗衣机",
        "空调": "家具家电 / 大家电 / 空调",
    }

    def __init__(self) -> None:
        self._retried: set[str] = set()
        self._heal_state: dict[str, int] = {}

    def _device_path(self, content: str) -> str | None:
        return next(
            (path for keyword, path in self._DEVICE_PATHS.items() if keyword in content),
            None,
        )

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
        cleaned = content.strip()
        snippet = re.sub(r"\s+", " ", cleaned)[:500]
        first_line = next(
            (
                line.strip()
                for line in cleaned.splitlines()
                if line.strip() and not re.fullmatch(r"图\s*\d+：?", line.strip())
            ),
            snippet,
        )
        title = first_line[:80]
        if "：" in title:
            after_colon = title.split("：", 1)[1].strip()
            if after_colon:
                title = after_colon
        title = title[:40] or "经验记录"
        device_path = self._device_path(cleaned)

        candidates: list[ExtractionResult] = []
        if any(keyword in cleaned for keyword in self._USAGE_KEYWORDS):
            candidates.append(
                ExtractionResult(
                    title=title,
                    content=snippet,
                    entry_type="experience",
                    suggested_node_path=device_path,
                    risk_points=[],
                    applicable_conditions=["以实际机型与设置面板为准。"],
                    confidence=0.9,
                )
            )
        else:
            candidates.append(
                ExtractionResult(
                    title=f"{title}（避坑要点）",
                    content=snippet,
                    entry_type="pitfall",
                    suggested_node_path=device_path,
                    risk_points=["示例内容需人工核对"],
                    applicable_conditions=[],
                    confidence=0.82,
                )
            )
        candidates.append(
            ExtractionResult(
                title=f"{title} 关键参数待确认",
                content="请补充具体型号、容量、尺寸与能效等参数数值，便于后续对比。",
                entry_type="parameter",
                suggested_node_path=device_path,
                risk_points=[],
                applicable_conditions=["以产品说明书为准。"],
                confidence=0.55,
            )
        )
        return candidates

    async def extract_info(
        self, content: str, content_type: str = "text"
    ) -> ExtractionResult:
        return (await self.extract_candidates(content, content_type))[0]

    async def generate_outline(
        self, goal: str, context: str = ""
    ) -> list[OutlineNode]:
        return [
            OutlineNode(
                title="硬装施工模块",
                description="水电、瓦工、木工等施工阶段关注点",
                children=[
                    OutlineNode(title="水电改造"),
                    OutlineNode(title="瓦工与防水"),
                ],
            ),
            OutlineNode(
                title="主材与辅材",
                description="地板、瓷砖、涂料等材料选择",
            ),
            OutlineNode(
                title="家具家电",
                description="大家电与家具选购、安装与避坑",
                children=[OutlineNode(title="冰箱"), OutlineNode(title="洗衣机")],
            ),
            OutlineNode(title="灯光与氛围"),
        ]

    async def draft_clarify(
        self, goal: str, context: str = ""
    ) -> ClarifyResult:
        if not goal.strip() and not context.strip():
            return ClarifyResult(
                needs_more=True,
                questions=[
                    ClarifyQuestion(
                        id="q1",
                        text="你目前处于装修的哪个阶段？",
                        options=["设计", "施工", "采购"],
                    ),
                    ClarifyQuestion(
                        id="q2",
                        text="需要重点覆盖哪些方向？",
                        options=["硬装施工", "主材选购", "家电家具", "灯光氛围"],
                        multiple=True,
                    ),
                ],
            )
        return ClarifyResult(needs_more=False, questions=[])

    def _demo_mutate_tree(
        self,
        tree: list[dict],
        instruction: str,
    ) -> list[dict]:
        """按演示规则确定性修改目录，供本地验收与测试。"""
        tree = copy.deepcopy(tree)
        if any(keyword in instruction for keyword in ("缩短", "精简")):
            for node in tree:
                if node.get("name") == "硬装施工模块":
                    node["name"] = "硬装施工"
                    break
            return tree
        if any(keyword in instruction for keyword in ("删除", "去掉", "移除")):
            for index, node in enumerate(tree):
                if "水电" in node.get("name", "") or "家具" in node.get("name", ""):
                    del tree[index]
                    return tree
            if tree:
                tree.pop()
            return tree
        if any(keyword in instruction for keyword in ("加", "添加", "新增")):
            quoted = re.findall(r"['\"「」]([^'\"「」]+)['\"「」]", instruction)
            if quoted:
                name = quoted[-1].strip()
            elif "收纳" in instruction:
                name = "收纳节点"
            elif "概览" in instruction:
                name = "项目概览"
            else:
                name = "新增节点"
            tree.append({"name": name, "description": None, "children": []})
            return tree
        tree.append({"name": "新增节点", "description": None, "children": []})
        return tree

    async def draft_chat(
        self,
        tree: list[dict],
        messages: list[dict],
        summary: str | None = None,
    ) -> ChatRoundResult:
        """演示会话式微调：讨论不改树；关键字触发应用；支持自愈演示。"""
        last_user = next(
            (m["content"] for m in reversed(messages) if m["role"] == "user"),
            "",
        )
        instruction = (last_user or "").strip()
        if any(
            keyword in instruction
            for keyword in ("讨论", "为什么", "怎么看", "?" , "？")
        ):
            return ChatRoundResult(
                reply_text=(
                    "这是演示讨论回复：可以继续聊目录颗粒度、层级或某一块的划分，"
                    "讨论不会改动候选树；确定后告诉我「应用」即可。"
                )
            )
        if "重名" in instruction:
            attempt = self._heal_state.get("dup", 0) + 1
            self._heal_state["dup"] = attempt
            if attempt == 1:
                tree = copy.deepcopy(tree)
                tree.append({"name": "硬装施工模块", "description": None, "children": []})
                return ChatRoundResult(
                    reply_text="我先提交一版（含同级重名）。",
                    tree=tree,
                )
            return ChatRoundResult(reply_text="已修正重名。", tree=tree)
        if "超层" in instruction or "6层" in instruction:
            attempt = self._heal_state.get("deep", 0) + 1
            self._heal_state["deep"] = attempt
            if attempt == 1:
                root = {"name": "层1", "description": None, "children": []}
                cursor = root
                for level in range(2, 9):
                    child = {"name": f"层{level}", "description": None, "children": []}
                    cursor["children"] = [child]
                    cursor = child
                return ChatRoundResult(
                    reply_text="我先提交一版（超过 6 层）。",
                    tree=[root],
                )
            return ChatRoundResult(reply_text="已压缩层级。", tree=tree)
        modified = self._demo_mutate_tree(tree, instruction)
        return ChatRoundResult(reply_text="已按你的要求更新目录。", tree=modified)

    async def summarize_intent(
        self, intent_note: str, instruction: str
    ) -> str:
        combined = "；".join(
            part for part in (intent_note, instruction) if part and part.strip()
        )
        return combined[:500]

    async def ocr(self, image_data: bytes) -> str:
        """确定性演示 OCR：不产生真实识别，供本地验收。"""
        try:
            from io import BytesIO

            from PIL import Image

            with Image.open(BytesIO(image_data)) as image:
                width, height = image.size
        except Exception:  # noqa: BLE001 - 图片解析失败时使用占位尺寸
            width = height = 0
        return (
            f"演示 OCR 识别文本（图片 {width}x{height}）："
            "西门子晶蕾洗碗机使用注意事项：晶蕾烘干不是默认开启的，"
            "每次需要手动勾选晶蕾烘干，否则只是普通烘干。"
        )

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
