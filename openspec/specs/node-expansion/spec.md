# AI Node Expansion Specification

## Purpose

定义在已有目录节点下进行 AI 节点拓展的能力：节点详情入口、目标子树生成（含现有子节点）、
递归差异确认（新增/保留/建议移除）、会话式微调复用、确认落库与并发规则，使目录在
已建立结构上持续生长。

## Requirements

### Requirement: Node expansion entry

系统 SHALL 在节点详情页（桌面内容区与 390px 移动端节点头部）的编辑按钮旁提供「AI 拓展建议」
图标入口，MUST 由用户手动触发，MUST NOT 自动执行。无活跃草稿时入口 MUST 对任意存在节点的
项目可见；存在活跃草稿且草稿目标节点为当前节点时入口 MUST 隐藏；存在活跃草稿但草稿目标
节点不是当前节点（或草稿为项目级起草）时入口 MUST 显示为禁用态并提示先处理或放弃现有草稿。
目标节点为根节点或任意层级节点均可发起。

#### Scenario: Show the entry next to the edit button
- **WHEN** 用户打开某节点详情页且该项目无活跃草稿
- **THEN** 节点名后的编辑按钮旁显示「AI 拓展建议」图标，点击后发起该节点的 AI 拓展

#### Scenario: Hide the entry while expanding the current node
- **WHEN** 该项目存在活跃拓展草稿且草稿目标节点就是当前节点
- **THEN** 节点详情页不显示「AI 拓展建议」入口，草稿面板提供「继续处理 / 放弃草稿」

#### Scenario: Disable the entry for other nodes while a draft is active
- **WHEN** 项目存在活跃草稿（拓展其他节点或项目级起草）且用户查看另一节点
- **THEN** 「AI 拓展建议」入口显示为禁用态，悬停提示先处理或放弃现有草稿

#### Scenario: Collapse the expansion panel when viewing another node
- **WHEN** 用户查看的节点不是活跃拓展草稿的目标节点
- **THEN** 拓展面板折叠为提示条，显示目标节点名称并提供「回到节点继续处理」与「放弃草稿」

#### Scenario: Show the entry on mobile
- **WHEN** 用户在 390px 移动视口打开某节点详情
- **THEN** 节点头部编辑按钮旁显示同款「AI 拓展建议」图标，点击行为与桌面一致

### Requirement: Target subtree generation

系统 SHALL 在发起拓展时创建目标节点归属的拓展草稿，跳过澄清步骤直接进入生成，
并将项目背景、目标节点的现有子树
（含节点说明）与项目内 Source 摘要（限长）组装为无状态提示词，由 AI 输出目标节点下的
子节点数组（嵌套 children）。AI 输出 MUST 遵守既有目录约束：最大 6 层、同级标准化名称
唯一、名称 1-100 字符、说明 ≤1000 字符。目标节点自身的名称与说明 MUST 由系统固定，
不随 AI 输出改变。

#### Scenario: Generate from node context and sources
- **WHEN** 用户在某节点发起拓展且项目包含背景与若干 Source
- **THEN** 系统生成以目标节点为根的目标子树并进入待确认状态，结构符合深度与重名约束

#### Scenario: Include existing children in the target tree
- **WHEN** 目标节点已有若干子节点
- **THEN** AI 目标树包含应保留的现有子节点（允许标注建议移除），而非仅新增节点

#### Scenario: Reject invalid AI output
- **WHEN** AI 返回非法 JSON、空树、超过 6 层或同级重名的目标树
- **THEN** 草稿标记失败并显示可读原因，不创建或删除任何正式节点，允许重试

#### Scenario: Retry a failed expansion without duplication
- **WHEN** 用户重试一个生成失败的拓展草稿
- **THEN** 系统重新生成目标树，成功后仅保留一条草稿，不重复创建草稿或节点

### Requirement: Recursive diff confirmation

系统 SHALL 在待确认态按标准化名称递归计算现有子树与 AI 目标树的差异，并向前端返回
「新增 / 保留 / 建议移除」的差异快照。仅存在于目标树中的节点标记为新增（含其完整子树）；
两边均存在的节点标记为保留并递归计算其 children 差异；仅存在于现有树的节点标记为建议移除，
默认不执行。差异快照 MUST 随候选树变更（会话应用或用户预览编辑）刷新。

#### Scenario: Diff with additions and removals
- **WHEN** AI 目标树在现有子节点基础上新增节点并省略某现有节点
- **THEN** 差异面板分别标记新增与建议移除，保留节点可展开查看内部差异

#### Scenario: Select removals by default
- **WHEN** 差异面板展示建议移除项
- **THEN** 移除项默认勾选（受保护项除外且不可勾选），用户可取消勾选以保留该节点，确认时仅删除仍勾选的移除项

#### Scenario: Toggle and rename added nodes
- **WHEN** 用户取消勾选某新增节点或修改其名称
- **THEN** 差异快照按新选择与名称刷新，未勾选的新增节点确认时不创建，改名遵守名称与同级唯一约束

#### Scenario: Block removal of referenced subtrees
- **WHEN** 某建议移除节点子树存在受保护 Entry 引用
- **THEN** 该移除项标记为不可移除并显示阻断数量，无法勾选

#### Scenario: Refresh the diff after conversational application
- **WHEN** 会话微调应用了新的目标树
- **THEN** 差异快照按新目标树重新计算并更新，面板显示最新状态

### Requirement: Conversational refinement for expansion

系统 SHALL 为待确认拓展草稿提供与起草一致的会话式微调，但发起时 MUST NOT 进入澄清步骤，
直接生成目标子树。生成后每条消息 SHALL 追加会话历史，模型可只讨论
（返回文字不改变目标树）或通过 `apply_directory_tree` 工具提交目标节点的完整目标子树。
系统 SHALL 严格校验提交的目标子树，非法输出回写原因并做有界重试（最多 2 次），仍失败
MUST 保持草稿可编辑并提示人工处理。历史 SHALL 有界：最近 10 轮完整保留，更早轮次压缩
为意图摘要，单草稿会话轮次不超过 30。

#### Scenario: Generate directly without clarification
- **WHEN** 用户在某节点发起拓展
- **THEN** 系统跳过澄清直接生成目标子树，不展示澄清问题

#### Scenario: Discuss without changing the target tree
- **WHEN** 用户在会话中仅提出讨论问题且模型未调用工具
- **THEN** 模型以文字回复，目标树与差异快照保持不变

#### Scenario: Apply a revised full target subtree
- **WHEN** 用户要求按讨论结果调整目录且模型调用 `apply_directory_tree`
- **THEN** 系统校验并应用目标节点的完整目标子树，差异快照刷新，会话显示「已应用」

#### Scenario: Give up after bounded retries
- **WHEN** 模型连续 2 次提交不合法的目标子树
- **THEN** 系统停止自动重试，回写具体违规原因，草稿保持可编辑

### Requirement: Confirm and apply expansion

确认采用 SHALL 在单事务内完成：校验目标节点仍存在且属于该项目，创建确认的新增节点
（含说明），删除确认的建议移除节点子树（复用受保护删除校验）。任一节点违反深度、重名、
归属或受保护删除规则 MUST 整批回滚并保持草稿待确认可编辑重试；重复提交 MUST 返回原结果
且不重复创建或删除。确认成功后草稿标记已确认，目录树刷新。

#### Scenario: Confirm additions and removals
- **WHEN** 用户勾选新增节点与若干建议移除项并确认
- **THEN** 系统创建新增节点、删除勾选的移除子树、保留其余节点，草稿标记已确认

#### Scenario: Roll back on protected removal
- **WHEN** 用户勾选了含受保护引用的移除项并确认
- **THEN** 整批回滚，不创建任何节点也不删除任何节点，草稿保持可编辑并列出阻断数量与路径

#### Scenario: Roll back on invalid creation
- **WHEN** 确认时新增节点触发同级重名或超深
- **THEN** 整个事务回滚，不创建任何节点，草稿保持待确认可修正后重试

#### Scenario: Re-submit confirmation without duplicates
- **WHEN** 用户对同一拓展草稿重复提交确认
- **THEN** 系统返回原结果，不重复创建或删除

#### Scenario: Fail when the target node is gone
- **WHEN** 确认时目标节点已被删除或移出项目
- **THEN** 系统拒绝确认，草稿置已放弃，界面提示重新发起拓展

### Requirement: Expansion draft concurrency

拓展草稿与项目级起草草稿 SHALL 共享同一项目的单活跃草稿名额：发起拓展时若存在活跃草稿
MUST 拒绝并提示先处理或放弃现有草稿；存在活跃拓展草稿时「AI 起草目录」入口同样隐藏。
手动创建节点时 MUST 先弹出「创建节点将放弃当前 AI 草稿」确认；删除目标节点时，指向该
节点的活跃拓展草稿 MUST 置为已放弃，防止基于失效基准继续确认。

#### Scenario: Reject a second active draft
- **WHEN** 项目已存在活跃草稿且用户发起拓展
- **THEN** 系统返回冲突并提示先处理现有草稿，不创建新草稿

#### Scenario: Discard the expansion draft on manual creation
- **WHEN** 存在活跃拓展草稿且用户确认手动创建节点
- **THEN** 草稿置已放弃，节点按正常流程创建，拓展入口恢复

#### Scenario: Invalidate the draft when its target node is deleted
- **WHEN** 用户删除某节点且它是活跃拓展草稿的目标节点
- **THEN** 该草稿标记已放弃，后续无法确认或继续会话

### Requirement: Mobile expansion flow

节点拓展的发起、澄清、差异确认、会话式微调与确认应用 SHALL 在 390px 移动视口可用，
与桌面共用响应式面板；差异树与消息区纵向排布且不横向溢出。

#### Scenario: Complete the expansion flow on mobile
- **WHEN** 用户在 390px 移动视口发起拓展并完成差异确认
- **THEN** 各步骤均可用且不横向溢出，确认后目录树正确刷新
