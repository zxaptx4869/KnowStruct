## ADDED Requirements

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
校验失败时按可重试失败处理。

#### Scenario: Ask once when information is insufficient
- **WHEN** 项目背景很短且没有已采集 Source
- **THEN** 界面显示最多 5 个结构化澄清问题，可逐题回答，也可跳过

#### Scenario: Skip clarification and generate anyway
- **WHEN** 用户点击「跳过，直接生成」
- **THEN** 系统不带澄清答案执行起草，候选树仍可生成

#### Scenario: Generate directly when information is sufficient
- **WHEN** 项目背景完整或存在足够 Source，AI 判定信息充足
- **THEN** 界面不展示澄清问题，直接进入起草进度

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

### Requirement: Instruction-based refinement and intent note

微调调用 SHALL 只组装「当前草稿 + 当前意图说明 + 本次意见」，MUST NOT 重复发送
原始背景与 Source 摘要。AI 输出 MUST 为增量改动清单（新增/改名/删除/移动），
提示词 MUST 声明未提及节点原样保留。系统 SHALL 维护「当前意图说明」：微调确认后
将本次意见并入说明，用户可编辑；AI 浓缩说明失败时 MUST 回退为追加原文。

#### Scenario: Refine with a single instruction
- **WHEN** 用户在调整意见框输入一句修改要求并提交
- **THEN** 系统以草稿、意图说明与新意见调用 AI，应用增量改动并更新草稿

#### Scenario: Keep untouched nodes unchanged
- **WHEN** 用户意见只涉及部分节点
- **THEN** 草稿中未提及的节点结构与名称保持不变

#### Scenario: Let the latest instruction win
- **WHEN** 用户新意见与意图说明或原始背景冲突
- **THEN** 系统以最新用户意见为最高优先级执行增量修改

#### Scenario: Update the intent note after confirmation
- **WHEN** 用户确认一次微调结果
- **THEN** 本次意见并入意图说明（AI 浓缩成功用浓缩段，否则追加原文），用户可再编辑

#### Scenario: Keep the draft on refinement failure
- **WHEN** 微调调用失败或输出校验失败
- **THEN** 草稿保持原样并提示失败原因，用户可重试或继续手动编辑

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

起草、澄清、预览编辑、微调与确认 SHALL 在 390px 移动视口可用，与桌面同一响应式
面板；控件纵向排布且不横向溢出。

#### Scenario: Complete the draft flow on mobile
- **WHEN** 用户在 390px 移动视口完成澄清、预览、微调并确认
- **THEN** 各步骤均可用且不横向溢出，确认后目录树正确更新
