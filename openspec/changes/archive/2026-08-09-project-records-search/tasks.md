## 1. 后端

- [x] 1.1 `list_project_entries` 支持 `q` 参数：去除首尾空白、标题/内容 LIKE 匹配、`%`/`_`/`\` 字面转义
- [x] 1.2 响应新增 `matched_count`，与 `total` 分离统计；`GET /projects/{id}/entries` 支持 `q`（≤100 字符）
- [x] 1.3 测试：关键词命中标题/内容、通配符字面、空词不过滤、无匹配、matched_count 正确、空列表响应含 matched_count

## 2. 前端

- [x] 2.1 `useProjectEntries` 支持 `q` 并入查询键；类型新增 `matched_count`
- [x] 2.2 整理模式桌面端新增搜索输入、搜索/清除按钮；搜索激活时头部显示「共 N 条 · 匹配 M 条」
- [x] 2.3 搜索无匹配显示「没有找到匹配的记录」；移动端不显示搜索框；移动端视口隐藏批量工具栏
- [x] 2.4 测试：搜索/清除、无匹配空态、头部匹配数

## 3. 验证与归档

- [x] 3.1 运行 `cd backend && .venv/bin/pytest -q && .venv/bin/ruff check .`
- [x] 3.2 运行 `cd frontend && npm test -- --run && npm run lint && npm run build`
- [x] 3.3 运行 `openspec validate --all --strict`
- [x] 3.4 浏览器验收：桌面整理页搜索过滤与清除、移动 390 无搜索框
- [x] 3.5 同步主规格并归档 change
