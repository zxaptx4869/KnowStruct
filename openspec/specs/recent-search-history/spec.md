# Recent Search History Specification

## Purpose

定义 P0 搜索页的最近搜索历史：用户在浏览器本地保存最近执行的搜索，空态可回顾并一键重搜，支持单条删除与清空，降低重复输入成本。

## Requirements

### Requirement: Persist recent searches per user

系统 SHALL 将当前认证用户的最近搜索历史保存在浏览器 localStorage 中，键按用户隔离；每条记录包含关键词与搜索时间，最多保存 8 条，新记录在前。读取时 SHALL 忽略格式非法的条目；localStorage 不可用或读写失败时 MUST 静默降级，不影响搜索功能本身。

#### Scenario: Record the first search
- **WHEN** 用户执行了一次成功搜索且此前没有任何历史
- **THEN** localStorage 中保存该关键词，作为最近搜索第一条

#### Scenario: Keep at most eight items
- **WHEN** 用户连续执行第 9 次不同的成功搜索
- **THEN** 最近搜索只保留最新的 8 条，最早的一条被移除

#### Scenario: Survive a page reload
- **WHEN** 用户刷新搜索页或稍后重新打开
- **THEN** 最近搜索列表从 localStorage 恢复，顺序与删除操作结果一致

#### Scenario: Isolate history between users
- **WHEN** 同一浏览器先后以两个不同账号登录并分别搜索
- **THEN** 每个账号只看到自己的最近搜索列表

#### Scenario: Degrade gracefully on storage failure
- **WHEN** localStorage 不可用或写入抛出异常
- **THEN** 搜索页仍可正常搜索与展示结果，最近搜索区块按无历史处理且不报错

### Requirement: Record completed searches with dedupe

系统 SHALL 在搜索请求成功返回（包括无结果）时记录去除首尾空白后的关键词；空关键词或纯空白 MUST 不记录；搜索失败 MUST 不记录。同一关键词（去除首尾空白后精确匹配）重复出现时 MUST 去重并移到列表顶部；由 URL `?q=` 恢复关键词触发的成功搜索 SHALL 与用户主动搜索同样记录。

#### Scenario: Record a successful search
- **WHEN** 用户搜索“冰箱”且请求成功返回结果
- **THEN** “冰箱”被写入最近搜索

#### Scenario: Record a search with no results
- **WHEN** 用户搜索一个无任何命中的关键词且请求成功返回空结果
- **THEN** 该关键词仍被写入最近搜索

#### Scenario: Skip blank keywords
- **WHEN** 用户未输入关键词或输入仅含空白的内容
- **THEN** 不产生任何最近搜索记录，也不触发搜索请求

#### Scenario: Move a repeated keyword to the top
- **WHEN** “冰箱”已在最近搜索列表中，用户再次成功搜索“冰箱”
- **THEN** 列表仍只有一条“冰箱”，且它位于列表顶部

#### Scenario: Skip failed searches
- **WHEN** 搜索请求失败（网络错误或服务端错误）
- **THEN** 该关键词不写入最近搜索，页面保留现有失败态与重试入口

#### Scenario: Record a search restored from the URL
- **WHEN** 用户打开或刷新带 `?q=冰箱` 的搜索页且搜索成功
- **THEN** “冰箱”被写入最近搜索并置顶

### Requirement: Show recent searches in the empty state

搜索页在未输入关键词时 SHALL 展示最近搜索列表（存在历史时）或现有引导（无历史时），两种情况下 MUST 不发起任何搜索请求。点击历史项 SHALL 将关键词回填输入框并触发搜索。有关键词输入时 SHALL 隐藏最近搜索区块。

#### Scenario: Show history when it exists
- **WHEN** 用户进入搜索页、未输入关键词且存在最近搜索
- **THEN** 页面显示“最近搜索”区块及最多 8 条历史项，不发起搜索请求

#### Scenario: Show guidance when history is empty
- **WHEN** 用户进入搜索页、未输入关键词且没有任何最近搜索
- **THEN** 页面显示“输入关键词开始搜索”类引导，不发起搜索请求

#### Scenario: Re-run a search from history
- **WHEN** 用户点击某条最近搜索
- **THEN** 输入框回填该关键词，页面执行搜索且该关键词移动到列表顶部

#### Scenario: Hide history while typing
- **WHEN** 输入框存在非空关键词
- **THEN** 页面不显示最近搜索区块，只显示搜索中的状态或结果

### Requirement: Delete a single item and clear all history

系统 SHALL 支持删除单条最近搜索与清空全部历史，均立即生效且无需确认；清空后回到无历史的引导态。

#### Scenario: Delete a single item
- **WHEN** 用户点击某条历史项的删除按钮
- **THEN** 该条被移除，其余条目顺序保持不变，localStorage 同步更新

#### Scenario: Clear all history
- **WHEN** 用户点击最近搜索区块的“清空”按钮
- **THEN** 全部历史被移除，页面显示“输入关键词开始搜索”类引导
