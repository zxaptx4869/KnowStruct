## Context

KnowStruct 已具备采集箱（Source）、OCR/AI 提取（Processing Task / Extraction）与逐条确认生成正式 Entry（含 `entry_sources` 关联）的能力，数据按 Workspace 隔离。全局搜索页目前是占位，后端也没有任何 Entry 查询接口。本 Change 补齐 P0 的"检索 + 溯源"：提供全局关键词搜索接口并实现搜索页，使用户能找回已归档 Entry 并从结果回溯原始 Source。

现有可复用能力：
- `Entry`（title/content/entry_type/project_id/node_id/status）与 `EntrySource` 关联表已存在。
- `Source` 含 title/content/link_url/source_type，`/api/inbox/sources/:id` 详情页已实现。
- 认证中间件 `Auth` 提供 `auth.workspace.id`，所有查询按 Workspace 过滤。

## Goals / Non-Goals

**Goals:**
- 提供一个 Workspace 内的全局关键词搜索接口，Entry 结果优先，Source 命中作为证据。
- 搜索页展示结果并可跳回节点路径或打开来源详情页，形成"记录 -> 来源"的追溯链路。
- 覆盖空关键词、无结果、失败重试、加载中四种界面状态，桌面与 390px 移动端可用。

**Non-Goals:**
- 不做项目/节点/类型/状态筛选（P1，G4）。
- 不做关键词高亮、最近搜索、语义搜索、相似推荐（P1/P2）。
- 不做 Entry 详情页、节点详情页的记录列表（后续切片）。
- 不引入全文索引、搜索引擎或图数据库；不修改数据模型，无迁移。

## Decisions

### 1. 搜索接口：`GET /api/search?q=`

单一全局搜索入口，一次请求同时返回 Entry 与 Source 两类结果：

```text
GET /api/search?q=冰箱
→ { "entries": [EntryHit...], "sources": [SourceHit...] }
```

- `q` 必填：去除首尾空白后必须非空且不超过 100 字符，否则返回 422 领域错误（`empty_query` / `query_too_long`）。
- 每类结果按 `created_at DESC, id DESC` 排序，默认各 50 条，前端不翻页。
- EntryHit 字段：`id`、`entry_type`、`title`、`content`、`project_id`、`project_name`、`node_id`、`node_path`（名称列表，空节点为 `[]`）、`sources`（最多 3 个 `{id, source_type, title}`）、`created_at`。
- SourceHit 字段：`id`、`source_type`、`title`、`content`、`link_url`、`project_id`、`project_name`、`entry_count`（关联正式记录数）、`created_at`。
- 理由：搜索页需要两类结果同屏（Entry 为主、Source 为证据），一次往返比两个接口更简单；P0 数据量小，无需分页。
- 备选：`/api/entries/search` 与 `/api/sources/search` 两个接口——增加往返且与"以 Entry 为主"的产品呈现不匹配，否决。

### 2. 匹配与转义：LIKE + 显式 ESCAPE

- 匹配字段：Entry 匹配 `title` 与 `content`；Source 匹配 `title`、`content`、`link_url`。
- 用户输入经 `escape_like()` 转义 `\`、`%`、`_` 后包成 `%...%`，使用 `like(pattern, escape="\\")`，保证 `%`、`_` 按字面匹配。
- 大小写行为依赖数据库默认排序规则（MySQL `utf8mb4_*_ci` 对拉丁字符不区分大小写，中文无大小写），不做额外归一化。
- 理由：P0 数据量（数十至上百条）下 LIKE 足够，避免引入 MySQL ngram 全文索引或外部搜索引擎。
- 备选：MySQL `FULLTEXT` + ngram 解析器——需要迁移与分词调优，P0 不必要，留待 P1。

### 3. 节点路径在服务端计算

- 命中 Entry 的 `node_id` 不为空时，服务端一次性加载相关项目的全部节点（按 `project_id` 过滤，节点必然属于 Entry 的 project），用父链生成路径名称列表；设置循环保护（最多 6 层）。
- 理由：前端无需为每条结果额外拉取节点列表，单次请求即可渲染路径；`knowledge-directory` 主规格已保证节点深度 ≤ 6 且无环。

### 4. Entry 关联 Source 与 Source 关联 Entry 数量

- Entry 命中：经 `entry_sources` 关联加载其 Source（Workspace 过滤），按 `created_at` 取前 3 个返回；前端渲染为可点击的小标签，其余只显示数量。
- Source 命中：按 `entry_sources` 统计关联的已归档 Entry 数量（同时过滤 `entries.workspace_id` 以防越权数据），返回 `entry_count`。
- 理由：追溯链"记录 -> 来源"与"来源 -> 记录"双向成立，且与 `extraction-confirmation` 主规格"关联可在 Entry 与 Source 两侧查询"一致。

### 5. 前端搜索页

- 新增 `frontend/src/search/`（`types.ts`、`queries.ts`），沿用 `inbox/`、`projects/` 的 tanstack-query 组织方式。
- 关键词与 URL `?q=` 双向同步（`useSearchParams`），刷新/返回保留关键词。
- 输入防抖 300ms 自动搜索；`q` 清空时回到引导态且不发起请求。
- Entry 结果卡片：类型徽标、标题、内容摘要（CSS 行数截断）、路径行"项目名 / 节点路径 · 来源 N 个"、来源小标签（点击 `→ /inbox/:sourceId`）、主操作"回到节点"（有 `node_id` 时 `→ /projects/:id/nodes/:nid`，否则 `→ /projects/:id`）。
- Source 命中卡片：来源类型徽标、标题、原文摘要、"项目名 · 关联 N 条正式记录"、"打开来源"（`→ /inbox/:sourceId`）。
- 状态：引导（输入关键词）、加载中（保留输入与旧结果或骨架）、失败（保留关键词 + 重试按钮）、无结果（保留关键词 + 清除按钮）、结果。
- 响应式：复用现有页面容器与 Tailwind/自定义 CSS，新增少量搜索样式类；桌面与 390px 共用同一组件。

### 6. 错误处理与安全边界

- 所有查询以 `auth.workspace.id` 过滤，跨 Workspace 数据按不存在处理（沿用现有约定）。
- 接口参数错误返回 422 领域错误（与现有 `DomainError` 结构一致），前端复用 `mutationMessage`/`ApiError` 展示。
- 网络失败/搜索失败时保留关键词与输入，允许重试，不自动重放。

## Risks / Trade-offs

- [LIKE 全表扫描] → P0 规模小可接受；搜索字段无索引，P1 引入 ngram 全文索引或 Elasticsearch 时再评估。
- [MySQL 与 SQLite 大小写行为差异] → 测试只断言子串匹配（含中文与转义），不断言大小写归一化，避免测试与生产行为不一致。
- [结果内容过长] → 接口返回完整 content（上限 20000 字符），前端 CSS 截断；不加服务端摘要，避免截断逻辑分散。
- [节点路径计算依赖父链] → 有循环保护；`knowledge-directory` 已保证无环与深度上限。
- [防抖竞态] → 每次搜索使用独立 query key，旧请求结果不会覆盖新关键词的结果。

## Migration Plan

- 无数据模型变更、无数据库迁移。部署时后端新增路由即可，前端随版本发布。
- 回滚：整体回退该提交；搜索接口 404 时前端回到占位引导态，不影响其他能力。

## Open Questions

- 无。范围与呈现已与用户确认：不做筛选、搜索跳转只到节点/项目路径、Entry 结果展示最多 3 个来源标签。
