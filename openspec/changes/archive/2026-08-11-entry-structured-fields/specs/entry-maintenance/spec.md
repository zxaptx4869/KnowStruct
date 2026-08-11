## MODIFIED Requirements

### Requirement: Edit formal records

系统 SHALL 允许编辑已归档正式记录的标题、内容、记录类型、适用条件、关键参数（key_params）
与避坑要点（risk_points），并可将其改归档到同项目内任意节点或清空为未归档。编辑 MUST
保持记录的 Workspace 与项目归属不变，空白标题或空内容 MUST 被拒绝，未提交任何字段的请求
MUST 被拒绝。关键参数与避坑要点可为空，空值表示清空对应字段。编辑结果 SHALL 直接覆盖
现有内容，不产生修改历史。

#### Scenario: Edit all record fields
- **WHEN** 用户提交新的标题、内容、记录类型、适用条件、关键参数与避坑要点
- **THEN** 记录按新内容更新并返回最新记录，原候选 Extraction 不被改写

#### Scenario: Reassign the record to another node in the project
- **WHEN** 用户将记录改归档到同项目内的另一个节点
- **THEN** 记录更新到新节点，新旧节点的记录数量随之更新

#### Scenario: Clear the archive node
- **WHEN** 用户将记录的归档节点清空
- **THEN** 记录变为未归档，仍归属原项目，可通过全局搜索与项目级记录列表找到，目录记录数量相应更新

#### Scenario: Clear structured fields
- **WHEN** 用户清空记录的关键参数或避坑要点并保存
- **THEN** 对应字段变为空，记录详情与列表不再展示该区块

#### Scenario: Reject a blank title or content
- **WHEN** 用户提交去空白后为空或超长的标题 / 内容
- **THEN** 系统拒绝修改并返回可读错误，记录保持原值

#### Scenario: Reject a node from another project
- **WHEN** 用户提交不属于记录所属项目的节点
- **THEN** 系统返回节点归属冲突，不修改记录

#### Scenario: Reject an empty update
- **WHEN** 用户未提交任何可编辑字段
- **THEN** 系统拒绝请求，记录保持不变

#### Scenario: Hide another workspace's entries
- **WHEN** 用户使用其他 Workspace 的项目或记录标识发起编辑
- **THEN** 系统按不存在处理，不暴露标识，也不修改任何数据

### Requirement: Project-level record list and statistics

系统 SHALL 提供项目级正式记录聚合查询：返回当前 Workspace 内该项目全部正式 Entry（含
`node_id` 为空的未归档记录），按创建时间倒序排列，每条携带节点路径、来源数量、关键参数
与避坑要点，并返回记录总数与未归档数量。项目详情与项目列表响应 SHALL 包含记录总数与
未归档数。其他 Workspace 的记录 MUST 不出现。没有任何记录时 MUST 返回空列表与 0 计数。

#### Scenario: List all project records including unarchived
- **WHEN** 用户请求某项目的记录列表，且项目内同时存在已归档与未归档记录
- **THEN** 系统返回该项目全部记录（含未归档），按创建时间倒序，未归档记录节点路径为空

#### Scenario: Include node path and source counts
- **WHEN** 记录列表返回某条已归档记录
- **THEN** 该条包含完整节点路径与其关联来源数量

#### Scenario: Return structured fields with records
- **WHEN** 记录列表或节点记录详情返回带有关键参数或避坑要点的记录
- **THEN** 响应包含对应非空字段，前端展示结构化字段区块

#### Scenario: Return totals and unarchived counts
- **WHEN** 项目内共有 N 条记录、其中 M 条未归档
- **THEN** 列表响应返回总数 N 与未归档数 M，项目详情与列表响应同步返回该计数

#### Scenario: Hide another workspace's records
- **WHEN** 请求中包含其他 Workspace 的项目标识
- **THEN** 系统按项目不存在处理，不返回任何记录或计数

#### Scenario: Return an empty list with zero counts
- **WHEN** 项目内没有任何正式记录
- **THEN** 系统返回空列表、总数 0、未归档数 0
