## ADDED Requirements

### Requirement: Source detail shows related formal entries

系统 SHALL 在 Source 详情响应中返回该来源关联的已归档正式 Entry（类型、标题、项目与节点、创建时间）。前端 SHALL 展示"关联正式记录"区块，并允许跳转到对应节点详情（未归档节点时跳转到项目页）。

#### Scenario: Return related entries in source detail
- **WHEN** 用户打开一个已产生正式记录的 Source 详情
- **THEN** 响应包含该来源关联的已归档记录，按创建时间倒序

#### Scenario: Jump from a related entry to its node
- **WHEN** 用户点击来源详情中的某条关联记录
- **THEN** 跳转到该记录所属节点详情；未归档到节点时跳转到所属项目页

#### Scenario: Hide another workspace's related entries
- **WHEN** Source 或关联记录属于其他 Workspace
- **THEN** 系统不返回跨 Workspace 数据，按不存在处理

#### Scenario: Hide the section without related entries
- **WHEN** Source 尚未产生任何正式记录
- **THEN** 详情响应返回空列表，前端不展示伪造的关联记录
