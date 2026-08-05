## Why

用户已能采集资料、确认 AI 候选并归档正式 Entry，但全局搜索页仍是占位：整理后的知识无法按关键词找回，正式记录也缺少从结果回溯原始 Source 的入口。P0 闭环"采集 -> 提取 -> 确认 -> 归档 -> 检索 -> 溯源"缺最后两环，本 Change 补齐关键词搜索与来源追溯。

## What Changes

- 新增全局搜索接口 `GET /api/search?q=<关键词>`，只搜索当前认证 Workspace 的数据：
  - Entry 结果为主：匹配正式 Entry 的标题与内容，返回项目名、节点路径（服务端由父链计算）、记录类型、内容与关联 Source 列表（最多 3 个）。
  - Source 命中作为证据：匹配 Source 的标题、内容或链接 URL，返回原文摘要、所属项目与"关联 N 条正式记录"数量。
  - 关键词去除首尾空白后非空才执行搜索；对 `%`、`_` 做 LIKE 通配符转义；只返回状态为已归档的 Entry；两类结果均按创建时间倒序，各最多 50 条。
- 重写前端搜索页（SearchPage）：
  - 输入关键词即触发搜索，Entry 结果与 Source 证据分栏展示。
  - Entry 结果可"回到节点"（跳转 `/projects/:id/nodes/:nid`；无节点时回到项目页）或逐一点开关联 Source（跳转 `/inbox/:sourceId`）。
  - 覆盖空关键词引导、搜索中、无结果（保留关键词并提供清除）与失败重试四种状态；桌面与 390px 移动端同一响应式页面。
- 不修改数据模型，无数据库迁移；搜索为纯读能力，不引入全文索引或搜索引擎。

## Capabilities

### New Capabilities

- `search-and-trace-source`: 全局关键词搜索正式 Entry 与原始 Source，并支持从结果回溯来源。

### Modified Capabilities

- 无。本 Change 不改变现有能力的行为，只新增搜索能力；项目/节点/类型/状态筛选按 P1 记录，不纳入本次。

## Impact

- 后端新增 `app/api/search.py`（路由）、`app/services/search.py`（服务）、`app/schemas/search.py`（请求响应模型），并在 `app/main.py` 注册；复用现有 `Entry`、`EntrySource`、`Source`、`Node`、`Project` 模型与 Workspace 隔离约定。
- 前端重写 `frontend/src/pages/SearchPage.tsx`，新增搜索查询 hook 与类型定义；路由不变（`/search` 已存在）。
- 测试：后端新增搜索接口测试（Workspace 隔离、空关键词、无结果、通配符转义、节点路径、跨项目、数量上限），前端新增搜索页测试（搜索触发、结果渲染、无结果、失败重试、跳转）。
- 依赖的现有主规格：`extraction-confirmation`（Entry 与 Source 关联）、`knowledge-directory`（节点路径）、`inbox-processing`（Source 内容字段）、`password-authentication`（Workspace 归属）。
