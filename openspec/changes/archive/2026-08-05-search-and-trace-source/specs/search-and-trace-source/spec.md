## ADDED Requirements

### Requirement: Workspace-scoped global keyword search

系统 SHALL 提供全局关键词搜索，只检索当前认证用户 Workspace 内的正式 Entry 与原始 Source。匹配 Entry 的标题或内容、或 Source 的标题、内容或链接 URL；结果以正式 Entry 为主、Source 命中为证据分别返回。两类结果 MUST 按创建时间倒序返回，每类最多 50 条，且只返回已归档状态的 Entry。

#### Scenario: Match an entry by title
- **WHEN** 用户搜索的关键词命中某 Workspace 内一条已归档 Entry 的标题
- **THEN** 系统返回该 Entry 结果，包含类型、标题、内容、项目名、节点路径（无节点时为空）与创建时间

#### Scenario: Match an entry by content
- **WHEN** 用户搜索的关键词命中某已归档 Entry 的内容正文
- **THEN** 系统返回该 Entry 结果，标题即使不含关键词也按内容命中展示

#### Scenario: Return source hits as evidence
- **WHEN** 用户搜索的关键词命中某 Source 的标题、内容或链接 URL，而未命中任何 Entry
- **THEN** 系统在来源命中区返回该 Source，包含类型、标题、原文、链接、项目名与关联正式记录数量

#### Scenario: Search across multiple projects
- **WHEN** 关键词命中了当前 Workspace 内不同项目的 Entry 与 Source
- **THEN** 系统合并返回各项目的结果，不要求用户先选择项目

#### Scenario: Hide another workspace's data
- **WHEN** 关键词命中其他 Workspace 的 Entry 或 Source，而当前用户不属于该 Workspace
- **THEN** 系统不返回任何跨 Workspace 结果，也不暴露数据是否存在

#### Scenario: Limit and order results
- **WHEN** 同一关键词命中超过 50 条 Entry 或 50 条 Source
- **THEN** 每类只返回最新创建的 50 条，且同类结果按创建时间倒序排列

#### Scenario: Exclude pending candidates and non-archived entries
- **WHEN** 关键词命中了待确认 Extraction 候选或非已归档 Entry
- **THEN** 系统不将其作为搜索结果显示

### Requirement: Validate and escape the search query

系统 SHALL 去除关键词首尾空白后执行搜索：为空时 MUST 拒绝请求并返回可读错误，不返回空结果集代替；超过 100 字符时 MUST 拒绝请求。搜索匹配 MUST 将用户输入中的 `%`、`_`、`\` 按字面字符处理，不得当作 SQL 通配符。

#### Scenario: Reject a blank query
- **WHEN** 用户提交仅含空白或空字符串的关键词
- **THEN** 系统返回"请输入搜索关键词"类错误，不执行搜索

#### Scenario: Reject an over-long query
- **WHEN** 用户提交超过 100 字符的关键词
- **THEN** 系统返回"关键词过长"类错误，不执行搜索

#### Scenario: Treat wildcard characters literally
- **WHEN** 用户搜索包含 `%` 或 `_` 的字符串（如 "100%棉" 或 "A_B"）
- **THEN** 系统只匹配按字面包含该字符串的 Entry 或 Source，不匹配通配符展开的额外结果

### Requirement: Traceable search results

搜索结果 MUST 支持从正式记录回溯原始来源，以及从来源查看其关联正式记录。Entry 结果 MUST 返回其关联 Source（最多 3 个，含类型与标题）；Source 命中 MUST 返回其关联的已归档 Entry 数量。前端 MUST 允许从 Entry 结果回到所属节点或项目，逐一点开关联 Source，并允许从 Source 命中打开来源详情页。

#### Scenario: Entry result carries up to three sources
- **WHEN** 搜索返回一条关联多个 Source 的 Entry
- **THEN** 结果携带按时间排序的最多 3 个来源（类型与标题），并在界面显示来源总数，每个来源可单独打开

#### Scenario: Entry result jumps to its node or project
- **WHEN** 用户点击 Entry 结果的"回到节点"
- **THEN** 已归档到节点的 Entry 跳转到对应节点路径页，未归档的 Entry 跳转到所属项目页

#### Scenario: Source hit shows its entry count
- **WHEN** 搜索返回一条已产生正式记录的 Source 命中
- **THEN** 结果展示"关联 N 条正式记录"，点击打开来源详情页

### Requirement: Search page interaction states

搜索页 SHALL 在同一响应式 Web 应用中提供桌面与 390px 移动端一致的体验，并覆盖引导、加载中、无结果与失败状态。关键词为空时 SHALL 显示引导且不发起请求；搜索中 SHALL 保留输入；无结果 SHALL 保留关键词并提供清除；失败 SHALL 保留关键词并提供重试。

#### Scenario: Show guidance before any search
- **WHEN** 用户进入搜索页且未输入关键词
- **THEN** 页面显示"输入关键词开始搜索"类引导，不发起任何搜索请求

#### Scenario: Keep the input while loading
- **WHEN** 用户输入关键词且搜索请求进行中
- **THEN** 页面显示加载状态并保留输入框中的关键词，允许继续编辑

#### Scenario: Keep keyword and offer clear on no results
- **WHEN** 搜索完成但没有命中任何 Entry 或 Source
- **THEN** 页面显示"没有找到 N"并保留关键词，提供清除关键词重新搜索的操作

#### Scenario: Keep keyword and offer retry on failure
- **WHEN** 搜索请求失败（网络错误或服务端错误）
- **THEN** 页面显示失败原因并保留关键词，提供重试按钮，不自动重放请求

#### Scenario: Render results on desktop and mobile
- **WHEN** 搜索结果存在，用户在桌面视口与 390px 移动视口分别查看搜索页
- **THEN** 两种视口均显示 Entry 与来源命中的结果、路径与来源入口，且导航、输入框与结果卡片不重叠不溢出
