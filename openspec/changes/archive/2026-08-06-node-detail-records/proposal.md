## Why

P0 验收要求"一周后仍能通过目录或搜索找到并使用已整理信息"，但目前目录里看不到任何正式记录：节点详情只显示子节点，没有记录列表；来源详情页也不显示该来源已产生哪些正式记录。界面侧的溯源闭环缺"目录 -> 记录"与"来源 -> 记录"两段，需要补齐。

## What Changes

- `Entry` 增加 `applicable_conditions` 列（JSON，可空），提供迁移 0006 并从关联 Extraction 回填存量数据；接受候选时把适用条件同时写入 Entry，使正式记录自包含（基线 D03 要求记录展示适用条件）。
- 后端新增/扩展接口：
  - `GET /api/projects/{project_id}/nodes/{node_id}/entries`：按节点返回正式记录（类型、标题、内容、适用条件、关联来源、创建时间），Workspace 隔离，仅返回已归档记录。
  - 项目节点列表 `GET /api/projects/{id}/nodes` 每个节点附带 `entry_count`（节点正式记录数量，对应 C5）。
  - Source 详情响应新增"关联正式记录"列表（类型、标题、项目与节点、时间）。
- 前端：
  - 节点详情页在子节点下方新增"正式记录"区块：按记录类型筛选、记录卡片展示标题/内容摘要/适用条件/关联来源入口，来源可跳转 `/inbox/:sourceId`；目录树节点旁显示记录数量。
  - 来源详情页新增"关联正式记录"区块，点击跳转到对应节点详情（未归档节点时跳项目页）。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `knowledge-directory`: 节点详情展示正式记录与节点记录数量（新增需求）。
- `extraction-confirmation`: 接受候选时正式 Entry 保存适用条件（新增需求）。
- `inbox-processing`: Source 详情返回并展示关联正式记录（新增需求）。

## Impact

- 后端：`app/models/entries.py` 加列；新增节点记录查询服务与接口（`app/api/projects.py`、`app/services/`）；`app/services/confirmation.py` 写入适用条件；`app/schemas/inbox.py` 的 Source 详情增加关联记录；新增迁移 `0006_entries_applicable_conditions`（加列 + 回填）；相应测试。
- 前端：`frontend/src/pages/ProjectDetailPage.tsx`（记录区块与类型筛选、节点记录数）、`frontend/src/pages/SourceConfirmPage.tsx`（关联记录区块）、`frontend/src/projects/` 与 `frontend/src/inbox/` 的类型与查询；相应测试。
- 数据库：MySQL 迁移 0006（`entries.applicable_conditions`），需在本地 MySQL 与测试环境验证。
