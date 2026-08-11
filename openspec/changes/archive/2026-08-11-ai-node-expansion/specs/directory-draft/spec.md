# AI Directory Draft Specification (delta)

## ADDED Requirements

### Requirement: Node-targeted drafts

草稿 SHALL 支持可空的目标节点归属（`target_node_id`）：为空表示项目级起草（既有行为），
非空表示节点级拓展。节点级草稿的候选树是目标节点下的目标子树，草稿响应 SHALL 返回
`target_node_id` 与差异快照（新增 / 保留 / 建议移除递归结构）。同一项目至多 1 条活跃草稿
的约束 MUST 同时适用于项目级起草与节点级拓展；目标节点被删除时，指向它的活跃草稿 MUST
置为已放弃，不得继续确认或会话。

#### Scenario: Return target node and diff for expansion drafts
- **WHEN** 客户端读取一条节点级拓展草稿
- **THEN** 响应包含目标节点标识与当前差异快照，供前端渲染差异确认面板

#### Scenario: Keep project-level drafts unchanged
- **WHEN** 客户端读取一条未绑定目标节点的草稿
- **THEN** 响应不包含差异快照，行为与既有项目级起草一致

#### Scenario: Share the single active draft slot
- **WHEN** 项目已存在活跃草稿且客户端发起节点级拓展
- **THEN** 系统拒绝并提示先处理现有草稿，不创建新草稿

#### Scenario: Discard the draft when its target node is deleted
- **WHEN** 活跃拓展草稿的目标节点被删除
- **THEN** 该草稿置为已放弃，后续确认或会话请求按草稿不可用处理
