## ADDED Requirements

### Requirement: Project-level record list and statistics

系统 SHALL 提供项目级正式记录聚合查询：返回当前 Workspace 内该项目全部正式 Entry（含 `node_id` 为空的未归档记录），按创建时间倒序排列，每条携带节点路径与来源数量，并返回记录总数与未归档数量。项目详情与项目列表响应 SHALL 包含记录总数与未归档数。其他 Workspace 的记录 MUST 不出现。没有任何记录时 MUST 返回空列表与 0 计数。

#### Scenario: List all project records including unarchived
- **WHEN** 用户请求某项目的记录列表，且项目内同时存在已归档与未归档记录
- **THEN** 系统返回该项目全部记录（含未归档），按创建时间倒序，未归档记录节点路径为空

#### Scenario: Include node path and source counts
- **WHEN** 记录列表返回某条已归档记录
- **THEN** 该条包含完整节点路径与其关联来源数量

#### Scenario: Return totals and unarchived counts
- **WHEN** 项目内共有 N 条记录、其中 M 条未归档
- **THEN** 列表响应返回总数 N 与未归档数 M，项目详情与列表响应同步返回该计数

#### Scenario: Hide another workspace's records
- **WHEN** 请求中包含其他 Workspace 的项目标识
- **THEN** 系统按项目不存在处理，不返回任何记录或计数

#### Scenario: Return an empty list with zero counts
- **WHEN** 项目内没有任何正式记录
- **THEN** 系统返回空列表、总数 0、未归档数 0

### Requirement: Organize mode with directory filter

系统 SHALL 在项目工作区提供查看与整理双模式：查看模式维持目录树导航行为；整理模式下目录树变为单选筛选器，提供「全部记录」与「未归档」两个伪选项以及真实节点选项，选中节点即筛选记录列表，再次点击已选中的节点或选择「全部记录」恢复全量。模式与筛选状态 MUST 持久化到 URL query，刷新或后退后保持。移动端 SHALL 提供相同模式入口与记录列表，支持单条编辑，但不提供多选批量操作条。

#### Scenario: Switch to organize mode via button
- **WHEN** 用户在查看模式点击「批量整理」按钮
- **THEN** 右侧切换为项目全部记录列表，按钮变为「回到查看」，URL 携带整理模式参数

#### Scenario: Filter records by clicking a node
- **WHEN** 整理模式下用户点击目录树中的某个节点
- **THEN** 记录列表只显示该节点的记录，URL 携带该节点筛选参数，页面不跳转

#### Scenario: Select all and unarchived pseudo options
- **WHEN** 整理模式下用户点击「全部记录」或「未归档」伪选项
- **THEN** 记录列表分别显示全部记录或仅未归档记录

#### Scenario: Clear the filter by clicking the selected node again
- **WHEN** 整理模式下用户再次点击已选中的节点
- **THEN** 筛选恢复为全部记录

#### Scenario: Mode and filter survive reload
- **WHEN** 用户在整理模式并选中某节点后刷新页面或后退
- **THEN** 页面保持整理模式与所选节点筛选

#### Scenario: Mobile supports list and single edit without batch bar
- **WHEN** 390px 视口下用户进入整理模式
- **THEN** 移动端展示记录列表与单条编辑入口，不显示多选与批量操作条

### Requirement: Batch move and delete records

系统 SHALL 允许在整理模式下多选记录执行批量移动到节点（`node_id` 为空表示批量清空归档为未归档）与批量删除。批量请求 MUST 为原子操作：任一记录不存在、属于其他 Workspace/项目、或目标节点不属于当前项目时，MUST 整批拒绝，不产生部分成功；空请求或超过 100 条 MUST 被拒绝。批量删除 MUST 沿用单条删除语义：移除记录及其来源关联，保留原始 Source 与 Extraction。

#### Scenario: Batch move records to a node
- **WHEN** 用户选中 3 条记录并批量移动到当前项目某节点
- **THEN** 三条记录一次性改归档到该节点，原节点与新节点记录数相应更新

#### Scenario: Batch move records to unarchived
- **WHEN** 用户选中记录并批量移动到「未归档」
- **THEN** 所选记录全部清空归档节点，出现在未归档筛选下

#### Scenario: Reject batch move with a foreign node
- **WHEN** 批量移动的目标节点属于其他项目
- **THEN** 系统整批拒绝并返回节点归属冲突，所有记录归档不变

#### Scenario: Reject a batch containing foreign records
- **WHEN** 批量请求中的某条记录不属于当前项目
- **THEN** 系统整批拒绝，不修改任何记录

#### Scenario: Batch delete keeps original sources
- **WHEN** 用户批量删除多条记录
- **THEN** 记录与来源关联被移除，原始 Source 与 Extraction 保留，来源详情与搜索不再返回该记录

#### Scenario: Reject an empty batch selection
- **WHEN** 用户未选择任何记录即触发批量操作
- **THEN** 前端不发送请求，批量按钮保持禁用
