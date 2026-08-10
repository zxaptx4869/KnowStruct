## REMOVED Requirements

### Requirement: Instruction-based refinement and intent note

**Reason**: 一次性指令式微调把自然语言意见映射到精确操作清单的翻译押在一轮上，
模型改写节点名或臆造层级时整批失败；由会话式微调（全量历史 + 完整树工具调用）取代。
**Migration**: 使用新增的会话轮接口（`POST /drafts/{id}/messages`）；`intent_note`
字段保留为早期会话摘要载体，不再作为独立 UI 概念。

## ADDED Requirements

### Requirement: Conversational refinement

系统 SHALL 为待确认草稿提供会话式微调：用户每条消息 SHALL 追加到会话历史，
系统以「约束提示 + 当前候选树快照 + 全量会话历史」调用带工具 `apply_directory_tree`
的模型。模型只讨论时 SHALL 返回文字且不改变候选树；模型决定应用目录时 SHALL 通过工具
调用提交完整目标树（嵌套 JSON）。系统 SHALL 严格校验目标树（≤6 层、同级标准化名称唯一、
名称 1-100、说明 ≤1000），校验通过 SHALL 应用为候选树并回写「已应用」反馈，校验失败
SHALL 回写具体原因并允许模型修正（有界重试，最多 2 次），仍失败 MUST 保持草稿可编辑并
提示人工处理。每次调用 MUST 注入当前最新候选树（含用户手动预览改动）。

#### Scenario: Discuss without changing the tree
- **WHEN** 用户在会话中提出与目录相关的讨论问题且模型未调用工具
- **THEN** 模型以文字回复，候选树保持不变，消息追加到会话

#### Scenario: Apply the full target tree via tool call
- **WHEN** 用户要求按讨论结果修改目录且模型调用 `apply_directory_tree`
- **THEN** 系统校验并应用完整目标树，预览更新，会话显示「已更新目录」标记

#### Scenario: Inject the current tree into every turn
- **WHEN** 用户在预览中手动修改过节点后再发消息
- **THEN** 调用上下文包含含手动改动的最新候选树，模型基于最新状态输出

#### Scenario: Self-heal an invalid tree with feedback
- **WHEN** 模型提交的树存在同级重名或超过 6 层等违规
- **THEN** 系统不应用并回写具体违规原因，模型修正后重新调用且成功应用

#### Scenario: Give up after bounded retries
- **WHEN** 模型连续 2 次提交仍不合法的树
- **THEN** 系统停止自动重试，会话显示违规原因，草稿保持可编辑，不应用任何变更

#### Scenario: Keep the confirm boundary
- **WHEN** 会话应用了候选树但用户未确认采用
- **THEN** 不创建任何正式节点，确认采用时仍执行既有约束二次校验

### Requirement: Conversation history and lifecycle

系统 SHALL 将每个草稿的会话消息持久化（user/assistant/system 角色），草稿重新起草时
MUST 清空该草稿的会话历史，草稿放弃或确认后会话入口 SHALL 关闭且消息保留可追溯。
历史 SHALL 有界：最近 10 轮完整保留，更早轮次压缩为早期意图摘要（压缩失败时丢弃最早
轮次）；单个会话轮次 MUST 不超过 30。消息读写 MUST 经项目归属限定到当前认证 Workspace。
会话 UI SHALL 在桌面与 390px 移动视口可用，树与消息区不横向溢出。

#### Scenario: Persist and restore a conversation
- **WHEN** 用户发送消息后刷新页面或重新进入草稿
- **THEN** 会话历史完整恢复，候选树保持上次应用状态

#### Scenario: Clear conversation on redraft
- **WHEN** 用户发起重新起草
- **THEN** 草稿会话历史被清空，候选树按新背景重新生成

#### Scenario: Bound history by summary and cap
- **WHEN** 会话超过 10 轮或接近 30 轮上限
- **THEN** 更早轮次被压缩为摘要（或丢弃），超限时提示开启新会话/重新起草，不无限增长

#### Scenario: Hide another workspace's conversation
- **WHEN** 已认证用户使用其他 Workspace 的项目标识读取或发送会话消息
- **THEN** 系统按项目不存在处理，不暴露任何消息或草稿

#### Scenario: Use the chat on mobile
- **WHEN** 用户在 390px 移动视口查看候选树并发起会话
- **THEN** 树预览、消息区与输入框均可用且不横向溢出，发送后等待态明确
