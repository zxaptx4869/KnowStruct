## 1. 交互改造

- [x] 1.1 移除防抖自动搜索：`input` 与 `keyword` 解耦，搜索仅在提交时触发（按钮 / 回车 / 历史标签 / URL 恢复），提交时同步 URL `?q=`
- [x] 1.2 输入法组合保护：`composingRef` + `isComposing` 拦截组合中的回车；空关键词提交显示提示且不发请求
- [x] 1.3 编辑输入框保留旧结果与 URL 关键词；清空输入回到空态；未提交且输入非空时显示"按回车或点击搜索"轻提示
- [x] 1.4 历史改为标签流（flex wrap）：关键词按钮 + 独立删除按钮 + 区块"清空"，标签高约 40px，输入框非空时隐藏

## 2. 测试

- [x] 2.1 重写/扩展 `SearchPage.test.tsx`：输入不触发请求、按钮提交、回车提交、组合中回车忽略、URL 恢复自动搜索、编辑保留旧结果、清空回空态、空提交提示
- [x] 2.2 历史标签流场景：标签展示、点击标签立即搜索、单条删除、清空、输入非空隐藏、localStorage 异常降级

## 3. 验证与同步

- [x] 3.1 前端全量验证：`cd frontend && npm test -- --run && npm run lint && npm run build`
- [x] 3.2 后端回归验证：`cd backend && .venv/bin/pytest -q && .venv/bin/ruff check .`
- [x] 3.3 浏览器验收：桌面与 390px 视口——输入不触发请求、按钮/回车搜索、组合回车忽略、标签流展示与删除、清空、刷新持久化、无横向溢出
- [x] 3.4 `openspec validate --all --strict` 通过
- [x] 3.5 同步主规格：`search-and-trace-source` 新增"显式提交触发搜索"，`recent-search-history` 更新空态与新增标签流需求
- [x] 3.6 归档 change 并提交，推送/合并前询问用户
