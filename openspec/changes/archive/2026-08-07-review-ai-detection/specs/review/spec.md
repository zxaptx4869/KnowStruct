## ADDED Requirements

### Requirement: Run scoped AI review scans

系统 SHALL 允许用户手动发起 AI 审查扫描，范围可为全部工作区、指定项目或指定节点（项目与节点级联选择）；扫描 SHALL 异步执行，页面可跟踪进行中/成功/失败状态，失败时可重新发起。扫描范围 SHALL 只包含当前 Workspace 的已归档 Entry，按同节点分组批量调用 AI；单次扫描条目数超过上限时 MUST 截断并明确提示建议缩小范围。未配置 AI 服务时扫描 MUST 失败并显示可读原因。

#### Scenario: Start a scan for the whole workspace
- **WHEN** 用户选择"全部工作区"并点击开始审查
- **THEN** 系统创建扫描任务并异步执行，页面显示扫描中状态

#### Scenario: Start a scan for a project or node
- **WHEN** 用户选择指定项目或节点并开始审查
- **THEN** 扫描只覆盖该范围内已归档 Entry，并按同节点分组进行比对

#### Scenario: Track scan progress and completion
- **WHEN** 扫描进行中或已完成
- **THEN** 页面轮询显示进行中状态，完成后展示候选发现数量

#### Scenario: Fail and retry when AI is not configured
- **WHEN** 用户发起扫描但 AI 服务未配置或调用失败
- **THEN** 扫描标记为失败并显示可读原因，用户可重新发起

#### Scenario: Truncate oversized scans with a hint
- **WHEN** 选定范围内的已归档 Entry 超过单次扫描上限
- **THEN** 扫描按上限截断执行，并提示用户本次达到上限、建议缩小范围

#### Scenario: Scan an empty scope
- **WHEN** 选定范围内没有任何已归档 Entry
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
