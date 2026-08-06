## 1. 后端记录维护接口

- [x] 1.1 `app/schemas/projects.py` 增加 `EntryUpdate`（title/content/entry_type/applicable_conditions/node_id 全部可选、至少一个字段、空白标题/空内容校验、node_id 可空表示清空）。
- [x] 1.2 `app/services/entries.py` 增加 `update_entry`（Workspace + 项目归属校验、同项目节点校验、直接覆盖、不写回 Extraction、返回最新记录）与 `delete_entry`（删除记录与 `entry_sources` 关联，保留 Source 与 Extraction）。
- [x] 1.3 `app/api/projects.py` 增加 `PATCH /api/projects/{project_id}/entries/{entry_id}` 与 `DELETE /api/projects/{project_id}/entries/{entry_id}`。
- [x] 1.4 新增 `backend/tests/test_entry_maintenance.py`：编辑各字段、空白/空内容/空更新拒绝、同项目改节点、跨项目节点冲突、清空节点、Workspace 隔离；删除后 Entry 与关联消失、Source/Extraction 保留、节点计数更新、重复与跨 Workspace 删除 404。

## 2. 前端编辑与删除

- [x] 2.1 `projects/types.ts` 增加 `EntryUpdateInput`；`projects/queries.ts` 增加 `useUpdateEntry` / `useDeleteEntry`，成功后失效节点记录与节点列表查询。
- [x] 2.2 `ProjectDetailPage` 记录卡片头部增加操作菜单（编辑记录 / 删除记录）；新增 `EntryEditDialog`（标题、类型、内容、适用条件、归档节点，失败保留输入）；删除复用 `ConfirmDialog` 并提示来源保留。
- [x] 2.3 前端测试：打开编辑对话框、保存触发 PATCH、失败保留输入、打开删除确认并触发 DELETE、菜单可访问性。

## 3. 验证、同步与归档

- [x] 3.1 后端全量验证：`cd backend && .venv/bin/pytest -q && .venv/bin/ruff check .`。
- [x] 3.2 前端全量验证：`cd frontend && npm test -- --run && npm run lint && npm run build`。
- [x] 3.3 OpenSpec 校验：`openspec validate --all --strict`。
- [x] 3.4 浏览器真实验收（桌面与 390px）：编辑保存与改节点、删除后节点计数与来源关联联动。
- [x] 3.5 同步主规格（sync-specs）、归档 Change（archive），在新分支提交；推送/合并前先询问用户。
