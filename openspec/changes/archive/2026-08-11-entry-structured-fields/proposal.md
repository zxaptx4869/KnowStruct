## Why

AI 提取候选时已产出「关键参数」与「风险点」，但链路在归档处断裂：key_params 连提示词与
解析层都没有接通（解析器硬编码为 None），risk_points 已存进候选却在确认页不展示、接受后
被丢弃，正式记录只剩标题与正文。同时 risk_points 的提示词没有任何质量约束，容易产出
"不同品牌要求不同"这类正确的废话。P1 的「标签与结构化字段」要求把这两类结构化信息
落库并展示，让参数类/避坑类记录可复用、可审查。

## What Changes

- AI 侧：候选提示词增加 `key_params`（可选输出，仅在有可提取键值参数时给出，禁止编造），
  并将 `risk_points` 重定义为「避坑要点」，要求只写具体、非显而易见、针对本条内容的要点，
  禁止通用套话，无要点时省略；解析器对两个字段做结构化校验并透传，demo Provider 补充
  确定性示例。
- 数据落库：Entry 新增 `key_params`、`risk_points` 两列（迁移 0019），历史记录从关联
  Extraction 回填 risk_points；Extraction 响应与前端类型补充 `key_params`。
- 确认流程：确认页候选卡片按需展示「关键参数/风险点」两个可编辑多行文本框（参数每行
  「键：值」，风险点每行一条），接受时默认继承候选、以用户编辑为准；批量确认自动继承
  候选字段，不改批量确认交互。
- 记录侧：项目记录列表与节点记录详情展示非空的结构化字段；编辑记录时可修改这两个字段。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `extraction-confirmation`: 候选字段清单增加 key_params/risk_points 及其质量规则；
  确认与归档时结构化字段随 Entry 落库并可编辑。
- `entry-maintenance`: 正式记录支持关键参数/风险点的展示、编辑与返回。
- `batch-confirm-candidates`: 批量确认创建 Entry 时取自候选现值，包含结构化字段。

## Impact

- 后端：AI 提示词与解析（`openai_compat.py`）、demo Provider、`Extraction`/`Entry`
  模型与迁移 0019、`ExtractionResponse`/`DecideRequest`/`NodeEntryResponse`/`EntryUpdate`
  等 Schema、逐条与批量确认服务。
- 前端：`SourceConfirmPage`（候选卡片编辑）、`ProjectDetailPage`（记录卡片展示与
  `EntryEditDialog` 编辑），桌面与移动共用。
- 文档：同步三个主规格后归档本变更。
- 明确不包含：标签、结构化字段进搜索/筛选、商品/参数候选对比、Review 利用结构化字段。
