## Why

一次性指令式微调把「自然语言意见 → 精确操作清单」的翻译完全押在一轮上：模型改写节点名或
臆造层级时整批失败（如「装修模式确定」引用不存在），用户只能重试或放弃。会话式微调把
同样的错误变成「系统回写反馈 → 模型自纠」的可修正回合，同时允许用户与模型讨论目录本身，
让「改目录」的体验接近网页端对话。

## What Changes

- 每个草稿 = 一个会话：新增 `directory_draft_messages`（draft_id、role、content、created_at），
  redraft 清空会话、discard 级联删除。
- `POST /drafts/{id}/messages {content}` 替换 `/refine`：追加用户消息 → 组装上下文
  （system 约束提示 + **当前候选树快照** + 全量会话历史）→ 调用模型（带
  `apply_directory_tree` 工具）→ 解析工具调用 → 严格校验 → 应用候选树 → 回写系统反馈 →
  返回新树与消息列表。
- 纯讨论不调用工具，只返回文字、树不变；应用成功时前端消息区显示「已更新目录」标记。
- 约束处理：≤6 层、同级标准化唯一、名称 1-100、说明 ≤1000 的严格校验 + 结构化错误反馈 +
  有界自愈重试（1-2 次）+ 确认采用时二次校验；完整树用嵌套 JSON，天然无环。
- 每次调用前注入当前最新候选树（含用户手动预览改动）。
- 历史有界：最近 10 轮完整 + 更早压缩为一段摘要；会话轮次上限 30。
- 意图说明不再作为独立 UI 概念，字段保留为早期摘要载体；移除「调整意见」输入框。
- 桌面为「树 + 会话」左右分栏，移动端上下堆叠（390px 可用）。

## Capabilities

### New Capabilities

（无，不引入新能力域）

### Modified Capabilities

- `directory-draft`: 移除「Instruction-based refinement and intent note」要求，
  新增「Conversational refinement」与「Conversation history and lifecycle」要求。

## Impact

- 后端：新消息表与迁移；schemas（消息、会话轮请求/响应）；`api/drafts.py` 以
  `POST /{draft_id}/messages` 替换 `/refine`；服务层新增会话轮逻辑（上下文组装、工具调用、
  应用树、反馈重试、历史压缩）；`ai/base.py` + `openai_compat.py` 增加带工具调用的 chat 助手；
  `DemoProvider` 模拟工具调用；redraft/discard 级联会话。
- 前端：DraftPanel 改为「树 + 会话」双区、消息列表、工具调用标记、发送与等待态。
- 测试与验收：后端 pytest（会话轮、校验反馈、自愈、历史压缩、级联）、前端 vitest、
  桌面 1440 + 移动 390 浏览器验收。
- 依赖的主规格：`openspec/specs/directory-draft/spec.md`。

## Appetite

中等切片，约 2-3 天。

## Non-Goals

- 流式输出（SSE）：v1 不做，每轮等待结果；v2 可加。
- 通用 AI 聊天、多模型按任务选择（E15 另行）。
- 自动确认或直接落正式节点：确认采用边界不变。
- 跨草稿会话共享、图数据库。
