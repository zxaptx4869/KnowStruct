## ADDED Requirements

### Requirement: Node detail shows formal records with source links

系统 SHALL 在节点详情页展示该节点下已归档的正式 Entry，并支持按记录类型筛选。每条记录 SHALL 展示类型、标题、内容、适用条件（可空）与关联来源入口；目录树与移动层级列表 MUST 显示每个节点的正式记录数量。

#### Scenario: List records of a node
- **WHEN** 用户打开一个包含已归档记录的节点
- **THEN** 节点详情显示记录列表，按创建时间倒序，每条记录包含类型、标题、内容、适用条件与关联来源入口

#### Scenario: Filter records by type
- **WHEN** 用户选择某一记录类型筛选
- **THEN** 记录列表只显示该类型的记录，切换回"全部"后恢复完整列表

#### Scenario: Open a record's source
- **WHEN** 用户点击记录上的关联来源
- **THEN** 跳转到对应来源详情页

#### Scenario: Show node record counts in the tree
- **WHEN** 项目目录加载且节点下存在正式记录
- **THEN** 目录树与移动层级列表显示每个节点的记录数量，无记录的节点不显示数量

#### Scenario: Hide another workspace's node records
- **WHEN** 用户请求其他 Workspace 的项目或节点记录
- **THEN** 系统按项目或节点不存在处理，不返回任何记录，也不暴露标识

#### Scenario: Show an empty node without fake counts
- **WHEN** 节点下没有任何正式记录
- **THEN** 记录区块显示空提示，目录树不显示伪造的记录数量

#### Scenario: Recover after record loading failure
- **WHEN** 节点记录加载失败
- **THEN** 界面保留节点上下文，明确显示失败并提供重试
