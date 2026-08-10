## ADDED Requirements

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
