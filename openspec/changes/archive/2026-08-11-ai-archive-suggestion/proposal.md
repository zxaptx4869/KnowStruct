## Why

采集内容的归档完全依赖手工选择：用户多数知道内容属于哪个项目但懒得提前选，确认候选时
又要自己翻节点下拉；AI 的 `suggested_node_path` 是自由文本、与现有目录无关，参考价值低。
本需求让 AI 在「项目归属」与「归档节点」两处给可靠建议：未选项目时自动推荐（带置信度），
提取时基于该项目目录生成节点建议，确认时预选或提示显式新建，降低整理成本。

## What Changes

- 采集界面项目保持非必填，旁加提示「不选择时 AI 将推荐归档项目」；提交采集时若未选项目，
  同步调用轻量项目推荐（内容 + 项目名称/背景列表），返回推荐项目、置信度与理由。
- 项目推荐置信度 ≥ 0.6 时展示「AI 建议归档：X（置信度）」且可修改；低于阈值不推荐，
  提示确认时手动选择；推荐结果与置信度存入 Source，用户后续所选项目始终优先。
- 提取候选时：若 Source 已有项目（用户所选或 AI 推荐），将该项目目录路径清单注入提示词，
  模型输出 `suggested_node_path` 与 `suggested_node_confidence`；置信度 ≥ 0.6 才进入确认建议。
- 逐条确认增强：用户选项目后按目录解析建议路径——全匹配则预选节点并标注「AI 建议」；
  部分匹配则提示「建议新建缺失段」并提供显式「新建」入口（沿路径创建，复用重名/超深/归属校验）；
  低置信度或目录变化时降级为手动选择并给出说明。
- 批量确认保持现状（统一归档节点，不做逐条建议）。
- 提取建议与确认兜底共用同一套「路径 → 节点」解析逻辑；阈值 0.6 首版写死。

## Capabilities

### New Capabilities
- `ai-archive-suggestion`: 采集时项目推荐（置信度门槛）与提取时目录感知的归档节点建议、
  确认时路径解析（预选/建议新建/低置信度降级）。

### Modified Capabilities
- `inbox-processing`: 采集提交支持项目推荐提示与推荐结果展示，Source 持久化推荐项目与置信度。
- `extraction-confirmation`: 确认流程支持建议路径预选、显式新建与低置信度降级说明。

## Impact

- 后端：`backend/app/api/inbox.py`（推荐调用与 Source 字段）、`backend/app/services/inbox.py`
  （提取上下文注入目录）、`backend/app/ai/`（项目推荐方法 + 候选解析新增置信度字段）、
  `backend/app/models/capture.py`（Source 新增推荐字段，含 Alembic 迁移）、确认路径解析工具。
- 前端：采集页（项目提示与推荐展示）、`SourceConfirmPage`（预选/新建/降级交互）、类型与 queries；
  `BatchConfirmDialog` 不改。
- 依赖主规格：`openspec/specs/inbox-processing/spec.md`、`extraction-confirmation/spec.md`、
  `knowledge-directory/spec.md`（新建节点校验）。
- 需要按需读取的详细文档：`docs/功能结构图与优先级.md` 第 4.2 节（采集/提取/确认边界）；
  `docs/OpenSpec前置准备基线.md` 第 5-6、8 节（页面状态与节点规则）。
- Appetite：约 1 周（涉及采集、提取、确认三环节与迁移，但复用既有提取/确认/节点创建机制）。
