# AI Directory Draft Specification

## Purpose

定义空项目内 AI 起草初始知识目录的候选能力：单轮澄清、候选树生成与校验、预览编辑、
会话式微调（讨论与应用）、会话历史与生命周期、重新起草、确认创建，
以及单草稿与手动创建互斥的并发规则。

## Requirements

### Requirement: Empty project draft entry

系统 SHALL 在空项目目录且无活跃草稿时提供「AI 起草目录」入口，MUST 由用户手动触发，
MUST NOT 自动执行或自动创建节点。同一项目同时 MUST 至多存在 1 条活跃草稿；
存在活跃草稿时 SHALL 隐藏起草入口，改为提供「继续处理」与「放弃草稿」。

#### Scenario: Show the draft entry in an empty project
- **WHEN** 用户进入无节点且无活跃草稿的项目
- **THEN** 空目录界面显示「创建第一个节点」与「AI 起草目录」两个操作，不自动发起起草

#### Scenario: Start a draft from the entry
- **WHEN** 用户点击「AI 起草目录」
- **THEN** 系统创建一条起草中草稿并进入起草流程，界面显示生成进度

#### Scenario: Hide the entry while a draft is active
- **WHEN** 项目存在起草中、待澄清、待确认或起草失败的草稿
- **THEN** 界面隐藏「AI 起草目录」入口，显示草稿待处理提示与「继续处理 / 放弃草稿」操作

### Requirement: Clarification round

系统 SHALL 在起草前评估项目信息充分性：背景过短或项目内 Source 不足时，SHALL 提供
单轮澄清问题，问题 MUST 不超过 5 个、以选项为主，并 MUST 提供「跳过，直接生成」。
信息充足时 MUST 不出现澄清步骤。澄清问题与充分性判断由 AI 生成并做结构化校验，
校验失败时按可重试失败处理。每个问题 MUST 由 AI 标注单选或多选：时长、数量、是否等
互斥维度为单选；「涵盖方面」「目的」「偏好」等可并存维度为多选。每个问题 MUST 提供
「其他」选项，选中后 SHALL 出现自由输入框，自定义内容并入答案；多选答案以数组提交。

#### Scenario: Ask once when information is insufficient
- **WHEN** 项目背景很短且没有已采集 Source
- **THEN** 界面显示最多 5 个结构化澄清问题，可逐题回答，也可跳过

#### Scenario: Skip clarification and generate anyway
- **WHEN** 用户点击「跳过，直接生成」
- **THEN** 系统不带澄清答案执行起草，候选树仍可生成

#### Scenario: Generate directly when information is sufficient
- **WHEN** 项目背景完整或存在足够 Source，AI 判定信息充足
- **THEN** 界面不展示澄清问题，直接进入起草进度

#### Scenario: Auto-detect single vs multi choice
- **WHEN** AI 生成澄清问题时标注类型
- **THEN** 互斥维度（如时长、数量）以单选呈现，可并存维度（如涵盖方面、目的）以多选呈现

#### Scenario: Fill a custom answer via the other option
- **WHEN** 用户选择某问题的「其他」并输入自定义内容
- **THEN** 该问题以自定义内容作为答案提交；多选问题的自定义内容并入选项数组

### Requirement: Candidate tree generation and validation

起草调用 SHALL 将项目目标/背景、项目内 Source 摘要（限长）与澄清答案组装为无状态提示词，
生成候选树。候选树 MUST 遵守既有目录约束：最大 6 层、同级标准化名称唯一、节点名称
1-100 字符、说明 ≤1000 字符。AI 输出非法结构、空树、超层或重名时 MUST 标记草稿失败并给出
可读原因，不得静默裁剪；重试 MUST 幂等，不重复创建草稿或节点。

#### Scenario: Generate a draft from background and sources
- **WHEN** 项目包含目标/背景与若干 Source，用户完成澄清
- **THEN** 系统生成多级候选树并进入待确认状态，节点结构符合深度与重名约束

#### Scenario: Generate from background only
- **WHEN** 项目没有 Source 但背景充足
- **THEN** 系统仍基于背景生成候选树，不要求必须先采集资料

#### Scenario: Fail on invalid AI output
- **WHEN** AI 返回非法 JSON、空树、超过 6 层或同级重名的候选
- **THEN** 草稿标记失败并显示原因，不创建任何正式节点，允许重试

#### Scenario: Retry a failed draft without duplication
- **WHEN** 用户重试一个起草失败的草稿
- **THEN** 系统重新执行起草，成功后仅保留一条草稿，不重复创建草稿或节点

### Requirement: Draft preview and manual edit

系统 SHALL 以树形预览待确认草稿，允许用户逐节点勾选、改名与删除。节点默认全选；
勾选某节点 MUST 自动包含其全部祖先，保证确认后树完整。改名 MUST 遵守节点名称
1-100 字符与同级唯一约束。

#### Scenario: Select all nodes by default
- **WHEN** 草稿进入待确认状态
- **THEN** 候选树节点默认全部勾选，用户可取消不需要的节点

#### Scenario: Include ancestors when selecting a node
- **WHEN** 用户勾选某深层子节点而其祖先未勾选
- **THEN** 确认范围自动包含该节点的全部祖先节点

#### Scenario: Rename a draft node
- **WHEN** 用户编辑候选节点名称后提交
- **THEN** 草稿保存新名称并校验 1-100 字符与同级唯一，非法输入被拒绝且不落库

#### Scenario: Delete a draft node
- **WHEN** 用户删除某候选节点
- **THEN** 该节点及其后代从确认范围移除，不影响其他节点

### Requirement: Conversational refinement

系统 SHALL 为待确认草稿提供会话式微调：用户每条消息 SHALL 追加到会话历史，
系统以「约束提示 + 当前候选树快照 + 全量会话历史」调用带工具 `apply_directory_tree`
的模型。模型只讨论时 SHALL 返回文字且不改变候选树；模型决定应用目录时 SHALL 通过
工具调用提交完整目标树（嵌套 JSON）。系统 SHALL 严格校验目标树（≤6 层、同级标准化
名称唯一、名称 1-100、说明 ≤1000），校验通过 SHALL 应用为候选树并回写「已应用」
反馈，校验失败 SHALL 回写具体原因并允许模型修正（有界重试，最多 2 次），仍失败
MUST 保持草稿可编辑并提示人工处理。每次调用 MUST 注入当前最新候选树（含用户手动
预览改动）。

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
历史 SHALL 有界：最近 10 轮完整保留，更早轮次压缩为早期意图摘要（压缩失败时丢弃
最早轮次）；单个会话轮次 MUST 不超过 30。消息读写 MUST 经项目归属限定到当前认证
Workspace。会话 UI SHALL 在桌面与 390px 移动视口可用，树与消息区不横向溢出。

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

### Requirement: Redraft from updated background

系统 SHALL 提供「重新起草」路径：用户可补充或修改背景说明后重新生成候选树，
用于大方向改变；重新起草 SHALL 替换当前草稿内容或保留为版本（本次至少替换当前草稿）。

#### Scenario: Regenerate after updating the background
- **WHEN** 用户编辑背景说明并发起重新起草
- **THEN** 系统以新背景重新生成候选树并回到待确认状态

### Requirement: Confirm and create nodes

确认采用 SHALL 在单事务内按「勾选节点 + 自动包含祖先」创建正式 Node，复用既有
深度、重名与归属校验；任一节点失败 MUST 整批回滚并保持草稿待确认可重试；
重复提交 MUST 返回原结果且不重复创建。确认成功后草稿标记已确认，正式目录就绪。

#### Scenario: Confirm a selected draft
- **WHEN** 用户确认采用勾选后的候选树
- **THEN** 系统创建所选及祖先节点，目录树刷新，草稿标记已确认

#### Scenario: Roll back the whole batch on failure
- **WHEN** 确认过程中任一节点违反深度或重名校验
- **THEN** 整个事务回滚，不创建任何节点，草稿保持待确认并可修正后重试

#### Scenario: Re-submit confirmation without duplicates
- **WHEN** 用户对同一草稿重复提交确认
- **THEN** 系统返回原结果，不创建重复节点

### Requirement: Draft concurrency and manual conflict

用户手动创建节点 SHALL 始终可用；当存在活跃草稿时，创建节点 MUST 先弹出确认
「创建节点将放弃当前 AI 草稿」，确认后草稿置已放弃并创建节点，取消则草稿保持不变。
草稿与手动目录 MUST NOT 并存。

#### Scenario: Confirm discarding the draft on manual creation
- **WHEN** 存在活跃草稿且用户确认创建节点
- **THEN** 草稿标记已放弃，节点按正常流程创建，起草入口恢复

#### Scenario: Cancel manual creation keeps the draft
- **WHEN** 存在活跃草稿且用户在确认弹窗中选择取消
- **THEN** 不创建节点、不改变草稿，界面回到草稿处理

### Requirement: Draft lifecycle, retry, and workspace safety

草稿状态 SHALL 包含起草中、待澄清、待确认、起草失败、已确认与已放弃。起草失败
SHALL 保留草稿并允许重试或放弃；放弃后起草入口恢复。所有草稿读写 MUST 经项目归属
限定到当前认证 Workspace，跨 Workspace 请求按不存在处理。

#### Scenario: Abandon a draft and restore the entry
- **WHEN** 用户放弃草稿
- **THEN** 草稿标记已放弃并从界面移除，「AI 起草目录」入口恢复

#### Scenario: Hide another workspace's draft
- **WHEN** 已认证用户使用其他 Workspace 的项目标识访问草稿
- **THEN** 系统按项目不存在处理，不暴露草稿是否存在

### Requirement: Mobile draft flow

起草、澄清、预览编辑、会话式调整与确认 SHALL 在 390px 移动视口可用，与桌面同一响应式
面板；控件纵向排布且不横向溢出。

#### Scenario: Complete the draft flow on mobile
- **WHEN** 用户在 390px 移动视口完成澄清、预览、微调并确认
- **THEN** 各步骤均可用且不横向溢出，确认后目录树正确更新

### Requirement: Node-targeted drafts

草稿 SHALL 支持可空的目标节点归属（`target_node_id`）：为空表示项目级起草（既有行为），
非空表示节点级拓展。节点级草稿的候选树是目标节点下的目标子树，草稿响应 SHALL 返回
`target_node_id` 与差异快照（新增 / 保留 / 建议移除递归结构）。同一项目至多 1 条活跃草稿
的约束 MUST 同时适用于项目级起草与节点级拓展；目标节点被删除时，指向它的活跃草稿 MUST
置为已放弃，不得继续确认或会话。

#### Scenario: Return target node and diff for expansion drafts
- **WHEN** 客户端读取一条节点级拓展草稿
- **THEN** 响应包含目标节点标识与当前差异快照，供前端渲染差异确认面板

#### Scenario: Keep project-level drafts unchanged
- **WHEN** 客户端读取一条未绑定目标节点的草稿
- **THEN** 响应不包含差异快照，行为与既有项目级起草一致

#### Scenario: Share the single active draft slot
- **WHEN** 项目已存在活跃草稿且客户端发起节点级拓展
- **THEN** 系统拒绝并提示先处理现有草稿，不创建新草稿

#### Scenario: Discard the draft when its target node is deleted
- **WHEN** 活跃拓展草稿的目标节点被删除
- **THEN** 该草稿置为已放弃，后续确认或会话请求按草稿不可用处理
