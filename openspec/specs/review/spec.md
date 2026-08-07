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
