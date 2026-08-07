## MODIFIED Requirements

### Requirement: Run scoped AI review scans

系统 SHALL 允许用户手动发起 AI 审查扫描，范围通过多层级树选择：项目为顶层，可展开到任意节点；选中项目即项目范围，选中节点即节点范围，不提供"全部工作区"选项。扫描 SHALL 异步执行，页面可跟踪进行中/成功/失败状态并显示开始时间与已用时；扫描完成后 SHALL 自动刷新问题列表，使重新浮现的已处理问题立即可见（无需整页刷新）；完成结果 SHALL 区分新候选数量与重新浮现的已处理问题数量。用户离开页面后返回 SHALL 自动恢复最近一次扫描的进度与结果（进行中继续轮询、已完成展示结果与候选）。同一 Workspace 存在进行中扫描时，再次发起 MUST 返回冲突并提示等待完成。扫描范围 SHALL 只包含当前 Workspace 的已归档 Entry，按同节点分组批量调用 AI；单次扫描条目数超过上限时 MUST 截断并明确提示建议缩小范围。未配置 AI 服务时扫描 MUST 失败并显示可读原因。

#### Scenario: Choose a project or node scope from a tree
- **WHEN** 用户点击"审查范围"并展开项目树
- **THEN** 用户可点击项目行选择项目范围，或展开后点击节点行选择节点范围

#### Scenario: Require a scope before scanning
- **WHEN** 用户未选择任何项目或节点就点击开始审查
- **THEN** 系统提示"请选择审查范围"，不创建扫描

#### Scenario: Track scan progress with timing
- **WHEN** 扫描进行中
- **THEN** 页面显示扫描中状态、开始时间与已用时

#### Scenario: Report new candidates and re-surfaced findings on completion
- **WHEN** 扫描完成
- **THEN** 页面显示新候选数量，并在重新浮现数量大于零时显示"已处理问题已重新浮现 M 条"

#### Scenario: Refresh findings after scan completion
- **WHEN** 扫描变为成功且重新浮现了已处理问题
- **THEN** 待处理列表自动刷新并展示重新浮现的问题，无需整页刷新或切换视图

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
