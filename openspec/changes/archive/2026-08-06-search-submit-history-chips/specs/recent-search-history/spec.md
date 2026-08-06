## MODIFIED Requirements

### Requirement: Show recent searches in the empty state

搜索页在未输入关键词时 SHALL 展示最近搜索列表（存在历史时）或现有引导（无历史时），两种情况下 MUST 不发起任何搜索请求。点击历史项 SHALL 将关键词回填输入框并触发搜索。有关键词输入时 SHALL 隐藏最近搜索区块。

#### Scenario: Show history when it exists
- **WHEN** 用户进入搜索页、未输入关键词且存在最近搜索
- **THEN** 页面显示"最近搜索"区块及最多 8 条历史项，不发起搜索请求

#### Scenario: Show guidance when history is empty
- **WHEN** 用户进入搜索页、未输入关键词且没有任何最近搜索
- **THEN** 页面显示"输入关键词开始搜索"类引导，不发起搜索请求

#### Scenario: Re-run a search from history
- **WHEN** 用户点击某条最近搜索
- **THEN** 输入框回填该关键词，页面立即执行搜索且该关键词移动到列表顶部

#### Scenario: Hide history while typing
- **WHEN** 输入框存在非空关键词
- **THEN** 页面不显示最近搜索区块

## ADDED Requirements

### Requirement: Display history as wrapping chips

最近搜索历史 SHALL 以按内容宽度自适应铺开的标签流展示（最多 8 条），每个标签包含关键词按钮与独立删除按钮，区块头部提供"清空"操作。点击关键词标签 SHALL 回填输入框并立即发起搜索；删除按钮 SHALL 仅删除对应条目。

#### Scenario: Wrap chips by content width
- **WHEN** 最近搜索存在多条且内容宽度不一
- **THEN** 标签按内容宽度紧凑排列并自动换行，不逐行占满

#### Scenario: Delete a single chip
- **WHEN** 用户点击某标签的删除按钮
- **THEN** 仅该条被移除，其余标签顺序与排列保持不变

#### Scenario: Re-run a search from a chip
- **WHEN** 用户点击某标签的关键词按钮
- **THEN** 输入框回填该关键词并立即发起搜索，该词移动到列表顶部

#### Scenario: Render chips on desktop and mobile
- **WHEN** 用户在桌面视口与 390px 移动视口分别查看最近搜索区块
- **THEN** 标签流均按宽度自适应换行、不横向溢出，删除按钮可独立点击
