## ADDED Requirements

### Requirement: Edit formal records

系统 SHALL 允许编辑已归档正式记录的标题、内容、记录类型与适用条件，并可将其改归档到同项目内任意节点或清空为未归档。编辑 MUST 保持记录的 Workspace 与项目归属不变，空白标题或空内容 MUST 被拒绝，未提交任何字段的请求 MUST 被拒绝。编辑结果 SHALL 直接覆盖现有内容，不产生修改历史。

#### Scenario: Edit all record fields
- **WHEN** 用户提交新的标题、内容、记录类型与适用条件
- **THEN** 记录按新内容更新并返回最新记录，原候选 Extraction 不被改写

#### Scenario: Reassign the record to another node in the project
- **WHEN** 用户将记录改归档到同项目内的另一个节点
- **THEN** 记录更新到新节点，新旧节点的记录数量随之更新

#### Scenario: Clear the archive node
- **WHEN** 用户将记录的归档节点清空
- **THEN** 记录变为未归档，仍归属原项目，可从项目级记录列表找到

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

### Requirement: Delete formal records

系统 SHALL 允许单条删除正式记录。删除 MUST 同时移除记录与来源的关联，但 MUST 保留原始 Source 与 Extraction；删除后节点记录数量、搜索结果与来源详情关联记录 SHALL 自动更新。对已删除记录或其他 Workspace 记录的删除请求 MUST 按不存在处理。

#### Scenario: Delete a record while keeping its source
- **WHEN** 用户确认删除一条记录
- **THEN** 记录及其来源关联被移除，原始 Source 与 Extraction 仍保留

#### Scenario: Update counts and related entries after delete
- **WHEN** 记录被删除后用户查看节点记录数量或来源详情
- **THEN** 节点记录数量减一，来源详情不再展示该关联记录，搜索也不再返回该记录

#### Scenario: Reject repeated or foreign deletes
- **WHEN** 用户再次删除已删除记录，或使用其他 Workspace 的记录标识删除
- **THEN** 系统按不存在处理并返回 404，不产生副作用
