## 1. 后端：项目记录列表与统计

- [x] 1.1 新增 `GET /projects/{project_id}/entries`：返回 `{items, total, unarchived_count}`，含未归档记录，按创建时间倒序，每条携带节点路径与来源数量
- [x] 1.2 `ProjectResponse` 增加 `entry_count`、`unarchived_entry_count`，项目列表与详情一次聚合返回
- [x] 1.3 新增 `POST /projects/{project_id}/entries/batch/move`（`node_id` 可空表示清空归档）与 `POST /projects/{project_id}/entries/batch/delete`，原子整批校验（归属当前项目、目标节点归属当前项目、≤100、非空）
- [x] 1.4 扩展 `schemas/projects.py` 与 `NodeEntryResponse`（增加 `node_path`）
- [x] 1.5 pytest 覆盖：列表（含未归档/节点路径/来源数/计数/跨 Workspace 隐藏/空项目）；批量移动（正常/到未归档/跨项目节点拒绝/跨项目记录拒绝）；批量删除（保留原始来源/空选择）；全量 `pytest -q && ruff check .` 通过

## 2. 前端：查看/整理双模式

- [x] 2.1 `ProjectDetailPage` 增加模式状态（URL query `mode`/`filter` 为唯一状态源），查看模式「批量整理」/整理模式「回到查看」按钮（桌面顶栏与移动端头部）
- [x] 2.2 整理模式记录列表：桌面表格（多选列/记录/节点路径或未归档黄标/来源/时间/操作），头部显示「全部记录 N 条 · 未归档 M 条」与筛选 chips（全部/未归档 + 类型）
- [x] 2.3 整理模式目录树筛选：树顶部「全部记录」「未归档」伪选项 + 真实节点单选；再次点击已选节点恢复全部；查看模式点树仍为导航
- [x] 2.4 多选批量条：移动到节点（含「未归档」目标）、删除（确认弹窗）、取消选择；操作失败保留选择并显示可读错误，成功后清空选择并刷新计数
- [x] 2.5 单条编辑复用 `EntryEditDialog`（归档节点下拉，可补录/改节点/清空归档），保存即时落库
- [x] 2.6 移动端：模式入口、卡片列表与单条编辑可用，不渲染批量条
- [x] 2.7 扩展 `projects/queries.ts` 与类型（项目记录列表、统计、批量端点）
- [x] 2.8 前端测试（模式切换/筛选/伪选项/批量移动删除/补录归档）+ `npm test -- --run && npm run lint && npm run build` 通过

## 3. 验收与归档

- [x] 3.1 浏览器验收（桌面 1440 + 移动 390）：未归档记录可见并补录归档、目录筛选、批量移动/删除、计数更新、空/失败状态
- [x] 3.2 `openspec validate --all --strict` 通过
- [x] 3.3 同步 `entry-maintenance` 主规格（移除「项目级记录列表属后续切片」表述）、归档 Change、提交代码
