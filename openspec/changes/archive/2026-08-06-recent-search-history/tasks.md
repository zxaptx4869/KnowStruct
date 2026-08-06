## 1. 存储模块与单元测试

- [x] 1.1 新增 `frontend/src/search/history.ts`：`readHistory(userId)`、`addSearch(userId, keyword)`、`removeSearch(userId, keyword)`、`clearHistory(userId)`，键 `knowstruct.search.history.<userId>`，最多 8 条，新条目在前，读取时过滤非法条目
- [x] 1.2 `addSearch` 实现 trim、空词不记录、trim 后精确匹配去重置顶、超出 8 条截断，所有函数对 localStorage 读写异常静默降级
- [x] 1.3 新增 `frontend/src/search/history.test.ts` 覆盖：首次记录、第 9 条挤出最旧、去重置顶、空词不记录、删除单条、清空、非法数据过滤、存储抛错降级

## 2. 搜索页集成

- [x] 2.1 `SearchPage.tsx` 接入 `useAuth` 获取 `user.id`，搜索请求成功返回（含空结果）时记录关键词，失败不记录；记录 effect 带幂等守卫，URL 恢复的搜索同样记录
- [x] 2.2 新增 `SearchHistory` 子组件：空关键词且有历史时显示“最近搜索”区块（标题 + 清空按钮 + 最多 8 条），无历史时保持现有引导
- [x] 2.3 历史项点击回填输入框触发搜索；单条删除与清空即时生效并回写 localStorage；有关键词时隐藏历史区块
- [x] 2.4 新增 `.search-history*` 样式类，桌面与 390px 移动端不溢出，删除按钮可点区域达标
- [x] 2.5 扩展 `SearchPage.test.tsx`：首次无历史显示引导、成功后清空显示历史、点击历史项重新搜索、重复搜索去重置顶、无结果词也记录、失败不记录、单条删除、清空回引导、localStorage 抛错时搜索仍正常

## 3. 验证与同步

- [x] 3.1 前端全量验证：`cd frontend && npm test -- --run && npm run lint && npm run build`
- [x] 3.2 后端回归验证：`cd backend && .venv/bin/pytest -q && .venv/bin/ruff check .`
- [x] 3.3 浏览器验收：参考 `/private/tmp/ks-browser-check/` 的 playwright-core 模式，覆盖桌面与 390px 视口的历史展示、点击回填、单条删除、清空与刷新持久化
- [x] 3.4 `openspec validate --all --strict` 通过
- [x] 3.5 同步主规格：新增 `openspec/specs/recent-search-history/spec.md`，更新 `openspec/specs/search-and-trace-source/spec.md` 空态需求
- [x] 3.6 归档 change 并提交，推送/合并前询问用户
