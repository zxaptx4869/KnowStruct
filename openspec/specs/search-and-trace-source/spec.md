# Search and Trace Source Specification

## Purpose

定义 P0 全局关键词搜索与来源追溯能力：用户可跨项目检索已归档正式 Entry 与原始 Source，从搜索结果回溯关联来源或回到归档节点，完成"检索 -> 溯源"闭环。

## Requirements

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

搜索页 SHALL 在同一响应式 Web 应用中提供桌面与 390px 移动端一致的体验，并覆盖引导、加载中、无结果与失败状态。关键词为空时 SHALL 显示最近搜索（存在历史时）或引导（无历史时），且均不发起请求；搜索中 SHALL 保留输入；无结果 SHALL 保留关键词并提供清除；失败 SHALL 保留关键词并提供重试。结果中的命中关键词 SHALL 以主题色高亮显示，高亮 MUST 与已展示结果使用的关键词一致，大小写不敏感。

#### Scenario: Show guidance before any search
- **WHEN** 用户进入搜索页、未输入关键词且没有最近搜索历史
- **THEN** 页面显示"输入关键词开始搜索"类引导，不发起任何搜索请求

#### Scenario: Show recent searches in the empty state
- **WHEN** 用户进入搜索页、未输入关键词且存在最近搜索历史
- **THEN** 页面显示最近搜索列表，不发起任何搜索请求

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

#### Scenario: Highlight matched keywords in results
- **WHEN** 搜索结果展示且关键词命中 Entry 的标题或内容、或 Source 的标题、正文或链接
- **THEN** 命中词以主题色高亮显示，同一关键词多处命中全部高亮，且拉丁字母匹配大小写不敏感

#### Scenario: Skip highlighting without a match
- **WHEN** 关键词为空，或当前结果文本不包含该关键词
- **THEN** 结果文本不显示任何高亮标记

#### Scenario: Highlight wildcard characters literally
- **WHEN** 搜索关键词包含 `%`、`_` 等特殊字符且结果文本按字面包含它们
- **THEN** 高亮只覆盖按字面包含该关键词的片段，不额外匹配通配符展开的文本

### Requirement: Search is triggered by explicit submit

搜索页 SHALL 仅在用户显式提交时发起搜索：点击"搜索"按钮、在输入框按回车（且输入法不在组合状态）、或点击最近搜索标签。输入内容变化 MUST 不自动发起请求。带 `?q=` 打开页面 SHALL 自动执行一次搜索。搜索结果展示后用户修改输入框但未提交时 SHALL 保留上一次结果与 URL 关键词；输入框清空时 SHALL 回到空态。空关键词提交 SHALL 显示提示且不发起请求。

#### Scenario: Search only on explicit submit
- **WHEN** 用户输入关键词但未点击搜索按钮、未按回车
- **THEN** 页面不发起任何搜索请求，也不进入加载态

#### Scenario: Submit with the search button
- **WHEN** 用户点击"搜索"按钮且输入框非空
- **THEN** 页面以当前输入发起搜索，并在成功后按规则记录历史

#### Scenario: Submit with the Enter key
- **WHEN** 用户在输入框按回车且输入法不在组合状态
- **THEN** 页面以当前输入发起搜索

#### Scenario: Ignore Enter during IME composition
- **WHEN** 输入法组合进行中用户在输入框按回车
- **THEN** 页面不发起搜索请求，该回车不改变搜索状态

#### Scenario: Restore a search from the URL
- **WHEN** 用户打开带 `?q=关键词` 的搜索页
- **THEN** 页面自动执行一次该关键词的搜索

#### Scenario: Keep previous results while editing
- **WHEN** 搜索结果已展示且用户修改输入框但未提交
- **THEN** 页面保留上一次结果与 URL 关键词，不发起新请求

#### Scenario: Reset to idle when clearing the input
- **WHEN** 用户将输入框清空
- **THEN** 页面回到空态（引导或最近搜索），不再展示旧结果

#### Scenario: Hint on empty submit
- **WHEN** 输入框为空或仅含空白时用户点击搜索或按回车
- **THEN** 页面显示"请输入搜索关键词"类提示，不发起任何请求

### Requirement: Combined filters on global search

全局搜索 SHALL 支持可选的项目、记录类型与项目内节点筛选，与关键词组合生效：
项目筛选 MUST 同时约束正式 Entry 与原始 Source 命中；记录类型与节点筛选 MUST 只约束
正式 Entry 命中。节点筛选 MUST 只匹配归档在该节点下的记录（不含子树）。
带项目筛选时 MUST 排除未分配项目的 Source。筛选 MUST 不改变既有结果语义：
Entry 优先、每类最多 50 条、按创建时间倒序、只返回已归档 Entry。

#### Scenario: Filter results by project
- **WHEN** 用户搜索关键词并选择当前 Workspace 内某项目
- **THEN** 搜索结果只包含该项目下的 Entry 与 Source 命中，其他项目结果不返回

#### Scenario: Filter entries by type
- **WHEN** 用户搜索关键词并选择某记录类型
- **THEN** Entry 命中只包含该类型的记录，Source 命中仍按关键词与项目筛选返回

#### Scenario: Filter entries by node without subtree
- **WHEN** 用户选择某项目下的某节点
- **THEN** Entry 命中只包含归档在该节点下的记录，其子节点记录不返回

#### Scenario: Filter without a keyword
- **WHEN** 用户只选择筛选条件、未输入关键词
- **THEN** 系统不发起搜索请求，页面保持引导或空态

#### Scenario: Exclude unassigned sources under a project filter
- **WHEN** 用户选择某项目进行搜索，且某 Source 未分配项目
- **THEN** 该未分配项目的 Source 不出现于来源命中

#### Scenario: Preserve result limits and order with filters
- **WHEN** 带筛选条件的关键词命中超过 50 条 Entry 或 50 条 Source
- **THEN** 每类仍只返回最新创建的 50 条，同类结果按创建时间倒序排列

### Requirement: Validate global search filter parameters

搜索接口 SHALL 校验筛选参数：`project` 必须属于当前认证用户的 Workspace；`type` 必须是
合法记录类型；`node` 必须与 `project` 同时提供且属于所选项目。任一参数非法时 MUST 拒绝
请求并返回可读错误，MUST NOT 以空结果集代替。

#### Scenario: Reject a project from another workspace
- **WHEN** 用户传入了不属于当前 Workspace 的 `project`
- **THEN** 系统返回可读的无效项目错误，不执行搜索

#### Scenario: Reject an invalid entry type
- **WHEN** 用户传入了非法的 `type`
- **THEN** 系统返回可读的无效记录类型错误，不执行搜索

#### Scenario: Reject a node without a project
- **WHEN** 用户传入了 `node` 但未同时传入 `project`
- **THEN** 系统返回可读的节点需配合项目错误，不执行搜索

#### Scenario: Reject a node from another project
- **WHEN** 用户传入的 `node` 不属于所传 `project`
- **THEN** 系统返回可读的节点与项目不匹配错误，不执行搜索

#### Scenario: Accept valid combined filters
- **WHEN** 用户传入属于当前 Workspace 的 `project`、合法 `type` 与属于该项目的 `node`
- **THEN** 系统按筛选与关键词组合执行搜索并返回结果

### Requirement: Search page filter interaction

搜索页 SHALL 提供项目、记录类型与项目内节点三个筛选控件。节点选项 MUST 随所选项目联动，
切换项目 MUST 清空已选节点。筛选状态 MUST 持久化到 URL query，刷新与前进后退保持。
带 `?q=` 打开页面 SHALL 自动执行一次搜索；已展示结果时变更筛选 SHALL 立即重新搜索；
未输入关键词时变更筛选 MUST 不发起请求。筛选条件下无结果 SHALL 提供清除筛选操作；
URL 携带非法筛选参数 SHALL 显示可读错误并提供清除筛选。页面 MUST 在桌面与 390px
移动视口均可用，控件不横向溢出。

#### Scenario: Load node options for the selected project
- **WHEN** 用户选择某项目
- **THEN** 节点选择器显示该项目下的节点选项，并可选择其中任一节点

#### Scenario: Reset the node when the project changes
- **WHEN** 用户已选择某项目下的节点后切换项目
- **THEN** 已选节点被清空，URL 中的节点参数被移除，节点选项按新项目重新加载

#### Scenario: Persist filters in the URL
- **WHEN** 用户搜索关键词并选择项目、类型与节点
- **THEN** URL 携带 `q`、`project`、`type`、`node` 参数，刷新后关键词与筛选条件均保持

#### Scenario: Restore filters from the URL on load
- **WHEN** 用户打开带 `?q=&project=&type=&node=` 的搜索页
- **THEN** 页面自动执行一次带该关键词与筛选条件的搜索，控件回显对应值

#### Scenario: Re-run the search when a filter changes after results
- **WHEN** 搜索结果已展示且用户变更项目、类型或节点
- **THEN** 页面立即以当前关键词与新的筛选条件重新搜索，无需再次点击搜索

#### Scenario: Show a clearable empty state under filters
- **WHEN** 关键词与筛选组合下没有命中任何 Entry 或 Source
- **THEN** 页面显示无结果状态，并提供清除筛选以恢复全量搜索的操作

#### Scenario: Recover from invalid URL filter parameters
- **WHEN** URL 携带的 `project`、`type` 或 `node` 参数非法，搜索返回可读错误
- **THEN** 页面保留关键词与合法筛选，显示错误并提供清除筛选操作

#### Scenario: Render filters on mobile
- **WHEN** 用户在 390px 移动视口打开搜索页并选择筛选条件
- **THEN** 筛选控件、输入框与结果卡片均可用且不横向溢出

### Requirement: Search history records keywords only

最近搜索历史 SHALL 仅按关键词记录与去重，不受筛选条件影响；点击历史关键词重新搜索时
SHALL 沿用当前页面的筛选条件。

#### Scenario: Ignore filters when recording history
- **WHEN** 用户带筛选条件完成一次搜索
- **THEN** 系统按关键词记录该条历史，筛选条件不进入历史条目

#### Scenario: Re-run history with current filters
- **WHEN** 页面已选择筛选条件且用户点击某条历史关键词
- **THEN** 系统以该关键词与当前筛选条件发起搜索
