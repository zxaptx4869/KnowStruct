## 1. 数据层与后端

- [x] 1.1 `Entry` 模型增加 `applicable_conditions`（JSON 可空）；新增迁移 `0006_entries_conditions`（加列 + 从 Extraction 回填 + downgrade 删列）；`confirmation.decide_extraction` 接受候选时把适用条件写入 Entry。
- [x] 1.2 新增 `GET /api/projects/{project_id}/nodes/{node_id}/entries`：Workspace 校验项目与节点归属、仅返回已归档记录、按创建时间倒序、经 `entry_sources` 批量加载来源（最多 3 个）、上限 200。
- [x] 1.3 节点列表 `GET /api/projects/{id}/nodes` 的 `NodeResponse` 增加 `entry_count`（按节点聚合已归档记录数）。
- [x] 1.4 `SourceDetailResponse` 增加 `entries`（`RelatedEntry`：id/entry_type/title/project_id/node_id/created_at），`get_source_detail` 加载该来源关联的已归档记录。
- [x] 1.5 后端测试：节点记录列表、类型/内容/适用条件/来源字段、Workspace 隔离、仅已归档、倒序与上限、`entry_count` 聚合、Source 详情 `entries`、迁移 0006 升级/回滚与回填。

## 2. 前端

- [x] 2.1 类型与查询：`Node` 增加 `entry_count`，`SourceDetail` 增加 `entries`，新增 `useNodeEntries(projectId, nodeId)` hook。
- [x] 2.2 `ProjectDetailPage` 节点内容区新增"正式记录"区块：类型筛选 chips、记录卡片（类型/标题/内容摘要/适用条件/来源标签/时间）、空态与失败重试；目录树与移动层级列表显示节点记录数。
- [x] 2.3 `SourceConfirmPage` 新增"关联正式记录"区块：每条记录跳转到所属节点详情（无节点时项目页）。
- [x] 2.4 前端测试：记录区块渲染与类型筛选、来源跳转、空态与失败重试、节点记录数、来源详情关联记录跳转。

## 3. 验证、同步与归档

- [x] 3.1 本地 MySQL 执行 `alembic upgrade head` 验证迁移 0006，并做数据冒烟。
- [x] 3.2 后端全量验证：`cd backend && .venv/bin/pytest -q && .venv/bin/ruff check .`。
- [x] 3.3 前端全量验证：`cd frontend && npm test -- --run && npm run lint && npm run build`。
- [x] 3.4 OpenSpec 校验：`openspec validate --all --strict`。
- [x] 3.5 浏览器真实验收（桌面与 390px）：节点详情记录列表与类型筛选、来源/节点跳转、来源详情关联记录。
- [x] 3.6 同步主规格（sync-specs）、归档 Change（archive），在新分支提交；推送/合并前先询问用户。
