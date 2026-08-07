# Review Specification

## Purpose

定义 P1 Review 的数据驱动问题检查与处理闭环：系统按 Workspace 实时发现缺来源、缺适用条件与长期待确认三类问题，用户可在 Review 页查看证据、标记已解决或忽略并支持撤销，为后续 AI 重复/冲突检测提供界面与数据基础。

## Requirements

### Requirement: Compute data-driven review findings

系统 SHALL 按当前认证用户 Workspace 实时计算三类 Review 问题：`missing_source`（已归档 Entry 在 `entry_sources` 中无任何关联）、`missing_conditions`（Entry 的适用条件为空或空列表）、`long_pending`（Source 存在创建超过 7 天的待确认候选，按 Source 聚合并返回待确认条数）。问题 MUST 排除已被标记已解决或忽略的目标；跨 Workspace 数据 MUST 不出现。无任何问题时 MUST 返回空列表。

#### Scenario: Find entries without a source
- **WHEN** Workspace 内存在一条已归档且没有任何来源关联的 Entry
- **THEN** 系统返回一条 `missing_source` 问题，包含该记录的标题、内容、项目与节点路径

#### Scenario: Find entries without applicable conditions
- **WHEN** Workspace 内存在一条适用条件为 NULL 或空列表的已归档 Entry
- **THEN** 系统返回一条 `missing_conditions` 问题，包含该记录摘要

#### Scenario: Find sources with long-pending candidates
- **WHEN** 某 Source 存在创建超过 7 天的待确认候选
- **THEN** 系统返回一条 `long_pending` 问题，按 Source 聚合并显示待确认条数

#### Scenario: Exclude handled findings
- **WHEN** 某问题已被标记已解决或忽略
- **THEN** 该问题不再出现在待处理列表中

#### Scenario: Hide another workspace's data
- **WHEN** 其他 Workspace 存在缺来源、缺条件或长期待确认的目标
- **THEN** 当前用户的 Review 问题列表不包含任何跨 Workspace 问题

#### Scenario: Return an empty list
- **WHEN** Workspace 内没有任何上述三类问题
- **THEN** 系统返回空的问题列表，前端显示无问题空态

### Requirement: Manage finding resolutions

系统 SHALL 允许用户对每条问题标记"已解决"或"忽略"（可附备注），同一问题的处理记录 MUST 唯一且操作幂等；撤销处理 MUST 将问题恢复到待处理列表。已处理列表 SHALL 可按 Workspace 查询并展示处理时间与备注。

#### Scenario: Resolve a finding with a note
- **WHEN** 用户将一条 `missing_conditions` 问题标记为已解决并填写备注
- **THEN** 该问题移出待处理列表，已处理列表出现该记录（含处理时间与备注）

#### Scenario: Ignore a finding
- **WHEN** 用户将一条问题标记为忽略
- **THEN** 该问题移出待处理列表，并出现在已处理列表

#### Scenario: Repeated handling is idempotent
- **WHEN** 用户对同一条问题重复提交相同处理
- **THEN** 处理结果保持不变，不产生第二条记录

#### Scenario: Undo a resolution
- **WHEN** 用户在已处理列表撤销一条处理
- **THEN** 处理记录被移除，该问题恢复出现在待处理列表

#### Scenario: Isolate resolutions per workspace
- **WHEN** 用户处理问题后，另一 Workspace 用户查看 Review
- **THEN** 处理记录不影响其他 Workspace 的问题列表

### Requirement: Review page interaction states

Review 页 SHALL 在同一响应式 Web 应用中提供桌面与 390px 移动端一致的体验，覆盖加载、无问题、结果、失败与处理中状态。页面 SHALL 提供待处理/已处理两个视图与问题类型筛选；问题卡片 SHALL 支持内联展开证据详情并跳转（长期待确认到确认页，缺来源/缺条件到所属节点或项目）；处理操作失败 MUST 不改变当前列表状态并可重试。

#### Scenario: List open findings with filters
- **WHEN** 用户打开 Review 页且存在多类问题
- **THEN** 页面按待处理视图展示问题卡片，可按类型筛选，卡片含类型徽标、标题、摘要与时间

#### Scenario: Show handled findings with undo
- **WHEN** 用户切换到已处理视图
- **THEN** 页面展示处理记录（问题类型、目标、处理方式、时间与备注），每条提供撤销操作

#### Scenario: Expand evidence and jump to source
- **WHEN** 用户展开一条长期待确认问题
- **THEN** 详情展示该 Source 的标题、类型与待确认条数，并可跳转到对应确认页

#### Scenario: Expand evidence and jump to entry context
- **WHEN** 用户展开一条缺来源或缺适用条件问题
- **THEN** 详情展示记录标题、内容、适用条件与节点路径，并可跳转到所属节点或项目

#### Scenario: Show empty state
- **WHEN** Workspace 没有任何待处理问题
- **THEN** 页面显示"没有待处理问题"类空态

#### Scenario: Keep state and retry on failure
- **WHEN** 问题列表加载失败或处理操作失败
- **THEN** 页面显示失败原因并保留当前状态，提供重试入口，不自动重放请求

#### Scenario: Render on desktop and mobile
- **WHEN** 用户在桌面视口与 390px 移动视口分别查看 Review 页
- **THEN** 列表、筛选与详情卡片均可用且不横向溢出

### Requirement: Run scoped AI review scans

系统 SHALL 允许用户手动发起 AI 审查扫描，范围通过多层级树选择：项目为顶层，可展开到任意节点；选中项目即项目范围，选中节点即节点范围，不提供"全部工作区"选项。扫描 SHALL 异步执行，页面可跟踪进行中/成功/失败状态并显示开始时间与已用时；用户离开页面后返回 SHALL 自动恢复最近一次扫描的进度与结果（进行中继续轮询、已完成展示结果与候选）。同一 Workspace 存在进行中扫描时，再次发起 MUST 返回冲突并提示等待完成。扫描范围 SHALL 只包含当前 Workspace 的已归档 Entry，按同节点分组批量调用 AI；单次扫描条目数超过上限时 MUST 截断并明确提示建议缩小范围。未配置 AI 服务时扫描 MUST 失败并显示可读原因。

#### Scenario: Choose a project or node scope from a tree
- **WHEN** 用户点击"审查范围"并展开项目树
- **THEN** 用户可点击项目行选择项目范围，或展开后点击节点行选择节点范围

#### Scenario: Require a scope before scanning
- **WHEN** 用户未选择任何项目或节点就点击开始审查
- **THEN** 系统提示"请选择审查范围"，不创建扫描

#### Scenario: Track scan progress with timing
- **WHEN** 扫描进行中
- **THEN** 页面显示扫描中状态、开始时间与已用时

#### Scenario: Resume the latest scan after returning
- **WHEN** 用户离开 Review 页后返回，且存在最近一次扫描
- **THEN** 页面恢复该扫描：进行中继续轮询，已完成展示结果与候选，失败显示原因并可重新发起

#### Scenario: Block concurrent scans
- **WHEN** 同一 Workspace 已存在 pending/running 扫描时再次发起扫描
- **THEN** 系统返回冲突并提示"已有扫描进行中，请等待完成"

#### Scenario: Fail and retry when AI is not configured
- **WHEN** 用户发起扫描但 AI 服务未配置或调用失败
- **THEN** 扫描标记为失败并显示可读原因，用户可重新发起

#### Scenario: Truncate oversized scans with a hint
- **WHEN** 选定范围内的已归档 Entry 超过单次扫描上限
- **THEN** 扫描按上限截断执行，并提示用户本次达到上限、建议缩小范围

#### Scenario: Scan an empty scope
- **WHEN** 选定项目或节点范围内没有任何已归档 Entry
- **THEN** 扫描成功完成且候选发现为空

### Requirement: Confirm AI candidate findings

AI 审查产出 SHALL 一律保存为候选发现（duplicate/conflict），用户 MUST 逐条确认或拒绝后才改变状态：确认后进入 Review 待处理列表，拒绝即丢弃。同一配对（类型 + 两条记录）的非拒绝候选在后续扫描中 MUST 不重复生成；已拒绝的配对可再次生成。候选操作 MUST 幂等。

#### Scenario: Confirm a candidate finding
- **WHEN** 用户确认某条 AI 候选发现
- **THEN** 该发现状态变为 open，并出现在 Review 待处理列表

#### Scenario: Reject a candidate finding
- **WHEN** 用户拒绝某条 AI 候选发现
- **THEN** 该发现状态变为 rejected，不再出现在任何列表

#### Scenario: Skip duplicate candidates on re-scan
- **WHEN** 后续扫描再次发现同一配对且原候选未被拒绝
- **THEN** 系统不重复生成候选

#### Scenario: Regenerate after rejection
- **WHEN** 同一配对曾被拒绝，后续扫描再次发现
- **THEN** 系统可再次生成该候选

#### Scenario: Repeated decision is idempotent
- **WHEN** 用户对同一候选重复提交相同决定
- **THEN** 状态保持不变，不产生副作用

### Requirement: Show AI findings in the review list

Review 待处理列表 SHALL 同时展示数据驱动问题与已确认的 AI 问题；AI 问题 SHALL 带"疑似重复/疑似冲突"类型标识，详情 SHALL 展示两条相关记录的对比与 AI 说明、建议、严重度，并可跳转到任一记录。AI 问题 SHALL 支持与数据驱动问题相同的解决/忽略/撤销操作，处理记录按 Workspace 隔离。

#### Scenario: List confirmed AI findings
- **WHEN** Workspace 内存在已确认的 AI 问题
- **THEN** 待处理列表按类型展示"疑似重复/疑似冲突"卡片

#### Scenario: Show pair evidence and jump
- **WHEN** 用户展开一条 AI 问题详情
- **THEN** 详情展示两条记录的标题与内容、AI 说明、建议与严重度，每条记录可跳转

#### Scenario: Resolve, ignore, and undo AI findings
- **WHEN** 用户对 AI 问题标记已解决、忽略或撤销
- **THEN** 行为与数据驱动问题一致，已处理列表可查且可撤销

#### Scenario: Isolate AI findings per workspace
- **WHEN** 其他 Workspace 存在 AI 问题或候选
- **THEN** 当前用户的列表与扫描结果不包含任何跨 Workspace 数据
