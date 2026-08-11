## Why

AI 起草目录解决了「空项目从零建目录」，但目录建好后就停滞了：装修过程中持续出现新的避坑点、参数和细节，用户需要不断手动创建/整理子节点，整理成本高。AI 节点拓展建议让目录在已有结构上「持续生长」，与 AI 起草形成完整的目录建设体验。

## What Changes

- 节点详情页（桌面与 390px 移动端）的编辑按钮旁新增「AI 拓展建议」图标入口，不占额外行。
- 新增节点级 AI 拓展草稿：AI 基于项目背景、节点现有子树与项目内 Source 摘要，生成该节点下的**目标子树**（包含应保留的现有子节点），而非仅建议新增。
- 差异确认面板：对照现有子树展示「新增 / 保留 / 建议移除」，由用户逐项确认后应用。
- 会话式微调复用既有机制：信息不足时可先澄清，模型可讨论或通过工具提交完整目标子树，意图说明持续折叠，最近 10 轮完整保留。
- 确认落库：新增节点按既有深度、同级重名与归属校验创建；标记移除的现有节点按受保护删除规则处理（存在受保护内容引用时阻止移除并提示数量）。
- 并发规则与 AI 起草共享：同一项目至多 1 条活跃草稿，存在活跃草稿时隐藏/禁用拓展入口，并保留「创建节点将放弃当前 AI 草稿」确认。
- 草稿模型扩展目标节点归属：区分「项目级起草」与「节点级拓展」，拓展草稿记录目标节点 id。

## Capabilities

### New Capabilities
- `node-expansion`: 在已有目录节点下进行 AI 目标子树生成、差异确认、会话式微调与确认落库。

### Modified Capabilities
- `directory-draft`: 草稿机制从「项目级空目录起草」扩展为支持「指定节点下的目标子树拓展」，包括目标节点归属、差异确认与合并创建。
- `knowledge-directory`: 节点详情页新增 AI 拓展入口；差异确认中的移除操作遵守受保护删除规则。

## Impact

- 后端：`backend/app/services/directory_draft.py`（目标子树生成、差异计算、合并创建）、`backend/app/api/drafts.py`（节点级拓展端点）、`backend/app/services/nodes.py`（批量创建/移除校验）、`backend/app/models/directory_draft.py`（新增 `target_node_id`），含 Alembic 迁移。
- 前端：`frontend/src/pages/ProjectDetailPage.tsx`（入口）、`frontend/src/directoryDraft/`（差异确认面板与类型）、`DraftPanel`（拓展模式）。
- 依赖主规格：`openspec/specs/directory-draft/spec.md`、`openspec/specs/knowledge-directory/spec.md`、`openspec/specs/extraction-confirmation/spec.md`（Source 摘要与归档规则）。
- 需要按需读取的详细文档：`docs/功能结构图与优先级.md` 第 4.1 节（C7 定义与边界）；`docs/OpenSpec前置准备基线.md` 第 5-6、8 节（节点生命周期与删除规则）。
- Appetite：约 1-2 周（主体复用既有草稿与会话机制，新增差异确认与合并逻辑）。
