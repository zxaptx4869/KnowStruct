# Knowledge Directory Specification (delta)

## MODIFIED Requirements

### Requirement: Editable node details and paths

系统 SHALL 允许用户修改节点名称；节点名称 MUST 为去除首尾空白后的 1 至 100 字符。
节点说明 SHALL 在界面中仅作展示，手动界面 MUST NOT 提供节点说明的创建或编辑入口；
AI 起草目录或 AI 节点拓展确认时 MAY 将候选说明写入节点说明字段；说明字段 SHALL 保留在
数据模型中。节点改名 MUST 保留节点和所有后代身份，完整路径 SHALL 由当前父链展示。

#### Scenario: Rename a node without rewriting descendants
- **WHEN** 用户将“大家电”改名为“厨房大家电”
- **THEN** 系统保留该节点及“冰箱”等后代的身份和关系，并在面包屑中显示新名称

#### Scenario: Show a node description without editing
- **WHEN** 用户打开包含说明的节点
- **THEN** 界面展示节点名称与说明，且不提供说明的创建或编辑入口

#### Scenario: Accept a description written by the AI draft or expansion
- **WHEN** 用户确认包含节点说明的 AI 起草或 AI 节点拓展候选
- **THEN** 正式节点保存该说明并可在节点详情展示，手动编辑入口仍不出现

#### Scenario: Reject an invalid rename
- **WHEN** 用户将节点改为空白、超长或与同级现有节点冲突的名称
- **THEN** 系统拒绝修改，节点原名称、路径和后代保持不变
