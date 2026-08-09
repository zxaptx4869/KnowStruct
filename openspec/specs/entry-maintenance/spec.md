# Entry Maintenance Specification

## Purpose

定义 P0 正式记录的编辑与删除能力：用户可修正已归档记录的标题、内容、类型与适用条件，改归档到同项目内其他节点或清空为未归档，并可单条删除记录（原始来源保留）。项目级记录列表支持关键词查询与匹配数展示，支撑桌面端整理模式在海量记录中快速定位。

## Requirements

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
- **THEN** 记录变为未归档，仍归属原项目，可通过全局搜索与项目级记录列表找到，目录记录数量相应更新

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

系统 SHALL 在项目工作区提供查看与整理双模式：查看模式维持目录树导航行为；整理模式下目录树变为单选筛选器，提供「全部记录」与「未归档」两个伪选项以及真实节点选项，选中节点即筛选记录列表，再次点击已选中的节点或选择「全部记录」恢复全量。模式与筛选状态 MUST 持久化到 URL query，刷新或后退后保持。移动端 SHALL 不提供整理模式按钮，改为提供「未归档记录」直达入口，进入未归档记录列表并支持单条编辑补录归档，不提供多选批量操作条。

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

#### Scenario: Mobile provides an unarchived entry without batch bar
- **WHEN** 390px 视口下用户在项目内查看
- **THEN** 移动端显示「未归档记录 N 条」入口，点击进入未归档列表并支持单条编辑补录归档，不提供整理模式按钮与批量操作条

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

### Requirement: Keyword search over project records

系统 SHALL 允许已认证用户按关键词查询其 Workspace 内项目的正式记录：`GET /projects/{id}/entries` 支持可选 `q` 参数，系统 MUST 去除首尾空白后按关键词匹配 Entry 标题或内容，`%`、`_`、`\` MUST 按字面字符处理不得作为通配符；空关键词或仅空白 MUST 不产生过滤；超过 100 字符的查询 MUST 被拒绝。响应 MUST 返回 `matched_count`（当前关键词匹配的记录数），与 `total`（项目全量记录数）分离。其他 Workspace 的记录 MUST 不出现。整理模式桌面端 SHALL 提供关键词输入、搜索与清除操作，搜索激活时头部显示匹配数；移动端 SHALL 不显示关键词搜索框。

#### Scenario: Search records by title or content
- **WHEN** 用户以关键词请求项目记录列表，关键词命中某条 Entry 的标题或内容
- **THEN** 系统返回命中的记录与对应的 `matched_count`，`total` 仍为项目全量记录数

#### Scenario: Treat wildcard characters literally
- **WHEN** 关键词包含 `%`、`_` 或 `\`
- **THEN** 系统只按字面包含该关键词的记录，不按通配符展开匹配

#### Scenario: Blank keyword returns all records
- **WHEN** 关键词为空或仅含空白
- **THEN** 系统返回项目全部记录，`matched_count` 等于 `total`

#### Scenario: Reject an over-long query
- **WHEN** 关键词超过 100 字符
- **THEN** 系统拒绝请求并返回可读错误，不执行查询

#### Scenario: Report matched count separately from total
- **WHEN** 项目有 N 条记录、关键词匹配其中 M 条
- **THEN** 响应返回 `matched_count` 为 M、`total` 为 N，前端在搜索激活时显示「共 N 条 · 匹配 M 条」

#### Scenario: Hide the search box on mobile
- **WHEN** 用户在 390px 移动视口进入项目整理页
- **THEN** 不显示关键词搜索框，且不显示多选批量操作条

#### Scenario: Show the no-match hint
- **WHEN** 关键词无任何匹配但项目存在记录
- **THEN** 列表显示「没有找到匹配的记录」提示，不显示「还没有正式记录」空态
