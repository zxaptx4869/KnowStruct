## REMOVED Requirements

### Requirement: Confirm AI candidate findings
**Reason**: 候选确认步骤取消；AI 审查发现直接进入待处理列表，由用户在待处理内用"标记已解决 / 拒绝"做决定，状态收敛为待处理 / 已处理 / 已拒绝三态。
**Migration**: 旧 candidate 状态数据升级为 open（直接成为待处理问题）；旧 rejected 数据补写 `resolution='rejected'` 处理记录保留拒绝意图。

## ADDED Requirements

### Requirement: Review scan history

系统 SHALL 提供"审查记录"视图，展示每次扫描的开始时间、结束时间、耗时（结束−开始）、范围名称、状态、新问题数、重新浮现数、跳过已拒绝数与决策跟进（已解决/已拒绝/待决定），失败记录 SHALL 可查看原因。记录 SHALL 分页返回（每页 20 条，可加载更多，返回总数），扫描完成时列表 SHALL 自动刷新。

#### Scenario: List scan records with timing and results
- **WHEN** 用户打开审查记录视图
- **THEN** 每条记录展示开始/结束时间、耗时、范围名称、状态与结果计数（新问题/重新浮现/跳过已拒绝）

#### Scenario: Show decision follow-up per scan
- **WHEN** 某次扫描产生的发现后续被处理
- **THEN** 该记录展示已解决、已拒绝与待决定的条数

#### Scenario: Show failed scans with reasons
- **WHEN** 某次扫描失败
- **THEN** 记录展示失败状态并可查看失败原因

#### Scenario: Paginate the history
- **WHEN** 审查记录超过一页
- **THEN** 每页 20 条，用户可加载更多，总数正确

#### Scenario: Refresh history on scan completion
- **WHEN** 新扫描完成
- **THEN** 审查记录列表自动刷新并包含该记录

## MODIFIED Requirements

### Requirement: Compute data-driven review findings

系统 SHALL 按当前认证用户 Workspace 实时计算两类 Review 问题：`missing_source`（已归档 Entry 在 `entry_sources` 中无任何关联）、`missing_conditions`（Entry 的适用条件为空或空列表）。问题 MUST 排除已被标记已解决、已拒绝或忽略的目标；跨 Workspace 数据 MUST 不出现。无任何问题时 MUST 返回空列表。

#### Scenario: Find entries without a source
- **WHEN** Workspace 内存在一条已归档且没有任何来源关联的 Entry
- **THEN** 系统返回一条 `missing_source` 问题，包含该记录的标题、内容、项目与节点路径

#### Scenario: Find entries without applicable conditions
- **WHEN** Workspace 内存在一条适用条件为 NULL 或空列表的已归档 Entry
- **THEN** 系统返回一条 `missing_conditions` 问题，包含该记录摘要

#### Scenario: Exclude handled and rejected findings
- **WHEN** 某问题已被标记已解决或已拒绝
- **THEN** 该问题不再出现在待处理列表中

#### Scenario: Hide another workspace's data
- **WHEN** 其他 Workspace 存在缺来源或缺条件的目标
- **THEN** 当前用户的 Review 问题列表不包含任何跨 Workspace 问题

#### Scenario: Return an empty list
- **WHEN** Workspace 内没有任何上述问题
- **THEN** 系统返回空的问题列表，前端显示无问题空态

### Requirement: Manage finding resolutions

系统 SHALL 允许用户对待处理问题标记"已解决"或"拒绝"（可附备注），同一问题的处理记录 MUST 唯一且操作幂等；撤销处理 MUST 将问题恢复到待处理列表。Review 页 SHALL 提供待处理、已处理、已拒绝三个视图：已处理展示 `resolution='resolved'` 的处理记录，已拒绝展示 `resolution='rejected'` 的处理记录，两个视图均支持撤销/恢复。

#### Scenario: Resolve a finding with a note
- **WHEN** 用户将一条问题标记为已解决并填写备注
- **THEN** 该问题移出待处理列表，已处理列表出现该记录（含处理时间与备注）

#### Scenario: Reject a finding
- **WHEN** 用户将一条问题标记为拒绝
- **THEN** 该问题移出待处理列表，并出现在已拒绝列表

#### Scenario: Repeated handling is idempotent
- **WHEN** 用户对同一条问题重复提交相同处理
- **THEN** 处理结果保持不变，不产生第二条记录

#### Scenario: Undo a resolution
- **WHEN** 用户在已处理或已拒绝列表撤销一条处理
- **THEN** 处理记录被移除，该问题恢复出现在待处理列表

#### Scenario: Isolate resolutions per workspace
- **WHEN** 用户处理问题后，另一 Workspace 用户查看 Review
- **THEN** 处理记录不影响其他 Workspace 的问题列表

### Requirement: Run scoped AI review scans

系统 SHALL 允许用户手动发起 AI 审查扫描，范围通过多层级树选择：项目为顶层，可展开到任意节点；选中项目即项目范围，选中节点即节点范围，不提供"全部工作区"选项。扫描 SHALL 异步执行，页面可跟踪进行中/成功/失败状态并显示开始时间与已用时；扫描完成后 SHALL 自动刷新问题列表，使重新浮现的已处理问题立即可见；完成结果 SHALL 区分新问题数量、重新浮现数量与跳过已拒绝数量。AI 审查发现 SHALL 直接以 open 状态进入待处理列表，不再经过候选确认。同一配对重新扫描时：无处理记录则跳过（已在待处理）；已解决则清除处理记录并重新浮现；已拒绝则不再报问题并在结果中计数。用户离开页面后返回 SHALL 自动恢复最近一次扫描的进度与结果。同一 Workspace 存在进行中扫描时，再次发起 MUST 返回冲突并提示等待完成。扫描范围 SHALL 只包含当前 Workspace 的已归档 Entry，按同节点分组批量调用 AI；单次扫描条目数超过上限时 MUST 截断并明确提示建议缩小范围。未配置 AI 服务时扫描 MUST 失败并显示可读原因。

#### Scenario: Choose a project or node scope from a tree
- **WHEN** 用户点击"审查范围"并展开项目树
- **THEN** 用户可点击项目行选择项目范围，或展开后点击节点行选择节点范围

#### Scenario: Require a scope before scanning
- **WHEN** 用户未选择任何项目或节点就点击开始审查
- **THEN** 系统提示"请选择审查范围"，不创建扫描

#### Scenario: Enter findings directly into the pending list
- **WHEN** AI 审查发现重复或冲突配对
- **THEN** 系统直接创建 open 问题并出现在待处理列表，不再生成候选

#### Scenario: Skip unhandled pairs on re-scan
- **WHEN** 重新扫描发现同配对且该问题仍在待处理
- **THEN** 系统跳过，不重复创建

#### Scenario: Re-surface resolved findings on re-scan
- **WHEN** 某问题曾被标记已解决，重新扫描覆盖该范围且两条相关记录仍在该范围内
- **THEN** 系统清除处理记录，问题重新出现在待处理列表并计入重新浮现数量

#### Scenario: Skip rejected pairs with a count
- **WHEN** 重新扫描发现同配对且该问题曾被拒绝
- **THEN** 系统不再报该问题，并在扫描结果中计入跳过已拒绝数量

#### Scenario: Report new, re-surfaced, and skipped counts on completion
- **WHEN** 扫描完成
- **THEN** 页面显示新问题数量，并在重新浮现或跳过已拒绝数量大于零时分别显示

#### Scenario: Track scan progress with timing
- **WHEN** 扫描进行中
- **THEN** 页面显示扫描中状态、开始时间与已用时

#### Scenario: Refresh findings after scan completion
- **WHEN** 扫描变为成功且重新浮现了已处理问题
- **THEN** 待处理列表自动刷新并展示重新浮现的问题，无需整页刷新或切换视图

#### Scenario: Resume the latest scan after returning
- **WHEN** 用户离开 Review 页后返回，且存在最近一次扫描
- **THEN** 页面恢复该扫描：进行中继续轮询，已完成展示结果，失败显示原因并可重新发起

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
- **THEN** 扫描成功完成且发现为空
