## ADDED Requirements

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
