## Why

正式记录目前只能通过接受 AI 候选创建，归档后无法修正或移除：错别字、错误的记录类型、错误归档节点、误确认的记录都只能"重采再确认"，真实使用必然受阻。P0 功能矩阵 F1「创建 / 编辑 / 删除记录」还缺编辑与删除两半。

## What Changes

- 后端新增记录维护接口：
  - `PATCH /api/projects/{project_id}/entries/{entry_id}`：编辑标题、内容、记录类型、适用条件；可将记录改归档到同项目内任意节点，或清空为未归档；Workspace 与项目归属校验；空白标题 / 空内容拒绝；直接覆盖现有内容，不做修改历史（修改历史为 P1）。
  - `DELETE /api/projects/{project_id}/entries/{entry_id}`：删除单条正式记录及其 `entry_sources` 关联；原始 Source 与 Extraction 保留；节点记录数、搜索结果、来源详情关联记录随实时查询自动更新。
- 前端：
  - 节点详情记录卡片增加操作菜单（桌面 hover、移动端右上角，与目录节点操作模式一致）：编辑记录、删除记录。
  - 编辑对话框：标题、记录类型、内容、适用条件（分号分隔）、归档节点（同项目节点或未归档）；提交失败保留输入。
  - 删除确认对话框：说明"该记录将永久删除，原始来源会保留"。
- 无数据库迁移、无新依赖。

## Capabilities

### New Capabilities

- `entry-maintenance`: 正式记录的编辑与删除（同项目内改归档节点、删除保留来源）。

### Modified Capabilities

- 无。

## Impact

- 后端：`app/api/projects.py` 或新增 `app/api/entries.py`（PATCH / DELETE）、`app/services/entries.py` 增加更新与删除服务、`app/schemas/projects.py` 增加更新请求与响应模型、相应测试。
- 前端：`ProjectDetailPage` 记录卡片操作菜单、编辑对话框、删除确认、`projects/queries.ts` 新增更新 / 删除 hook 与失效刷新、相应测试。
- 依赖的现有主规格：`extraction-confirmation`（记录创建）、`knowledge-directory`（节点记录浏览与数量）、`inbox-processing`（来源关联记录）。
