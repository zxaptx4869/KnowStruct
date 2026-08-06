## MODIFIED Requirements

### Requirement: Search page interaction states

搜索页 SHALL 在同一响应式 Web 应用中提供桌面与 390px 移动端一致的体验，并覆盖引导、加载中、无结果与失败状态。关键词为空时 SHALL 显示引导且不发起请求；搜索中 SHALL 保留输入；无结果 SHALL 保留关键词并提供清除；失败 SHALL 保留关键词并提供重试。结果中的命中关键词 SHALL 以主题色高亮显示，高亮 MUST 与已展示结果使用的关键词一致，大小写不敏感。

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

#### Scenario: Highlight matched keywords in results
- **WHEN** 搜索结果展示且关键词命中 Entry 的标题或内容、或 Source 的标题、正文或链接
- **THEN** 命中词以主题色高亮显示，同一关键词多处命中全部高亮，且拉丁字母匹配大小写不敏感

#### Scenario: Skip highlighting without a match
- **WHEN** 关键词为空，或当前结果文本不包含该关键词
- **THEN** 结果文本不显示任何高亮标记

#### Scenario: Highlight wildcard characters literally
- **WHEN** 搜索关键词包含 `%`、`_` 等特殊字符且结果文本按字面包含它们
- **THEN** 高亮只覆盖按字面包含该关键词的片段，不额外匹配通配符展开的文本
