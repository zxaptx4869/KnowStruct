## 1. 后端搜索接口

- [x] 1.1 新增 `app/schemas/search.py`：定义 `EntryHit`、`SourceHit`、`SearchResponse` 与查询参数校验（`q` 去空白后必填、≤100 字符）。
- [x] 1.2 新增 `app/services/search.py`：实现 `escape_like()`（转义 `\`、`%`、`_`）与 Workspace 内搜索服务——Entry 按 title/content 匹配、Source 按 title/content/link_url 匹配、节点路径父链计算（循环保护）、Entry 关联 Source 取前 3、Source 关联 Entry 计数、按创建时间倒序各限 50、只返回已归档 Entry。
- [x] 1.3 新增 `app/api/search.py` 路由（`GET /api/search?q=`）并在 `app/main.py` 注册，使用 `Auth` 取 Workspace 隔离。
- [x] 1.4 新增 `backend/tests/test_search_api.py`，覆盖：空/空白/超长关键词拒绝、`%`/`_` 字面匹配、Entry 标题与内容命中、Source 命中、跨项目合并、其他 Workspace 数据不暴露、节点路径与未归档节点、Entry 来源最多 3 个、Source 关联 Entry 计数、倒序与 50 条上限、候选与非归档 Entry 不出现。

## 2. 前端搜索页

- [x] 2.1 新增 `frontend/src/search/types.ts` 与 `queries.ts`（tanstack-query hook，关键词作 query key）。
- [x] 2.2 重写 `frontend/src/pages/SearchPage.tsx`：关键词与 URL `?q=` 双向同步、300ms 防抖、引导/加载/无结果/失败四种状态、Entry 结果卡片（类型徽标、标题、内容摘要、项目名与节点路径、来源标签与"回到节点"跳转）、Source 命中卡片（类型、标题、摘要、关联记录数、"打开来源"跳转）。
- [x] 2.3 在 `frontend/src/index.css` 补充搜索页响应式样式，桌面与 390px 不重叠不溢出。
- [x] 2.4 新增 `frontend/src/pages/SearchPage.test.tsx`，覆盖：空词不请求、输入触发搜索、Entry/Source 结果渲染、来源标签与"回到节点"跳转、无结果保留关键词并清除、失败重试保留关键词。

## 3. 验证、同步与归档

- [x] 3.1 后端全量验证：`cd backend && .venv/bin/pytest -q && .venv/bin/ruff check .`。
- [x] 3.2 前端全量验证：`cd frontend && npm test -- --run && npm run lint && npm run build`。
- [x] 3.3 OpenSpec 校验：`openspec validate --all --strict`。
- [x] 3.4 浏览器真实验收（playwright-core + 系统 Chrome）：桌面与 390px 视口搜索真实数据，验证结果跳转节点/来源、无结果与失败状态。
- [ ] 3.5 同步主规格（sync-specs）、归档 Change（archive），并在分支提交；推送/合并前先询问用户。
