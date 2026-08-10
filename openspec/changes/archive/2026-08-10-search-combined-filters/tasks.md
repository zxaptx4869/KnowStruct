## 1. 后端：筛选参数与校验

- [x] 1.1 在 `backend/app/schemas/search.py` 定义搜索筛选参数模型或函数签名所需字段
- [x] 1.2 在 `backend/app/services/search.py` 增加筛选校验（项目属当前 Workspace、类型合法、节点须配合项目且属于该项目）
- [x] 1.3 在 `backend/app/services/search.py` 将项目、类型、节点过滤叠加到 Entry 查询（节点不含子树）
- [x] 1.4 在 `backend/app/services/search.py` 将项目过滤叠加到 Source 查询（未分配项目在项目筛选下排除）
- [x] 1.5 在 `backend/app/api/search.py` 暴露 `project`、`type`、`node` 可选查询参数并透传

## 2. 后端：自动化测试

- [x] 2.1 在 `backend/tests/test_search_api.py` 补充筛选组合场景（项目/类型/节点、节点不含子树、未分配 Source 排除）
- [x] 2.2 在 `backend/tests/test_search_api.py` 补充非法参数场景（跨 Workspace 项目、非法类型、无项目节点、跨项目节点）
- [x] 2.3 在 `backend/tests/test_search_api.py` 补充既有上限、排序与仅归档 Entry 语义在筛选下不变的回归场景
- [x] 2.4 运行 `cd backend && .venv/bin/pytest -q && .venv/bin/ruff check .` 全绿

## 3. 前端：筛选交互与 URL 同步

- [x] 3.1 在 `frontend/src/search/queries.ts` 将 queryKey 与请求参数扩展为关键词 + 项目/类型/节点
- [x] 3.2 在 `frontend/src/pages/SearchPage.tsx` 添加项目、记录类型、节点筛选控件（复用 `useProjects`/`useNodes`，节点按树形缩进）
- [x] 3.3 实现节点随项目联动与切换项目重置节点
- [x] 3.4 实现筛选变更触发语义（已展示结果时立即重搜；关键词为空时只更新 URL 不请求）
- [x] 3.5 实现 URL 参数 `q`/`project`/`type`/`node` 的读取、写入、刷新恢复与 `?q=` 自动搜索
- [x] 3.6 实现筛选下无结果的「清除筛选」操作与非法 URL 参数的可读错误恢复
- [x] 3.7 确保最近搜索历史仍按关键词记录，历史点击沿用当前筛选
- [x] 3.8 为搜索页筛选控件补充样式，保证 390px 移动视口不横向溢出

## 4. 前端：自动化测试

- [x] 4.1 在 `frontend/src/pages/SearchPage.test.tsx` 补充筛选选择、节点联动与重置场景
- [x] 4.2 补充筛选变更重搜、URL 恢复自动搜索、无结果清除筛选、非法参数错误恢复场景
- [x] 4.3 补充历史仅记录关键词与历史点击沿用筛选的场景
- [x] 4.4 运行 `cd frontend && npm test -- --run && npm run lint && npm run build` 全绿

## 5. 真实验收与文档同步

- [x] 5.1 运行 `openspec validate --all --strict` 通过
- [x] 5.2 使用 demo 账号在桌面 1440 与移动 390 浏览器中验收筛选、URL 刷新恢复、空态与错误态
- [x] 5.3 将 delta spec 同步到 `openspec/specs/search-and-trace-source/spec.md`（新增组合筛选、参数校验、页面交互、历史仅关键词四条 Requirement）
- [x] 5.4 按归档流程归档 `search-combined-filters`，并提交分支（推送/合并前先经用户确认）
