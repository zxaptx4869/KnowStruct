## Context

当前数据链路：采集 Source -> Processing Task -> Extraction 候选 -> 用户确认 -> 创建 Entry 并写 `entry_sources`。目录树与节点详情已有完整的节点 CRUD，但节点详情只渲染子节点；Source 详情（`/inbox/:sourceId`）只展示提取候选与来源原文，不展示该来源产生的正式记录。`Entry` 表没有适用条件字段，基线 D03 要求的"记录展示适用条件"目前无法从正式记录本身读取。

## Goals / Non-Goals

**Goals:**
- 节点详情页展示该节点下的正式记录列表（类型、标题、内容、适用条件、关联来源），支持按记录类型筛选；目录树节点显示记录数量。
- Source 详情页展示其关联的正式记录，并可跳转到对应节点/项目。
- 正式 Entry 自包含适用条件（新列 + 迁移回填），接受候选时写入。

**Non-Goals:**
- 不做记录编辑、删除、移动（F1 的编辑/删除部分，后续切片）。
- 不做批量移动/批量修改状态、修改历史、标签等结构化字段（P1）。
- 不做记录详情独立页（本切片内联卡片展示，跳转目标仍是节点详情与来源详情）。
- 不做来源预览抽屉改造；沿用现有 `/inbox/:sourceId` 整页。

## Decisions

### 1. Entry 增加适用条件列（方案 B）

- `entries.applicable_conditions`：`JSON` 可空列（`list[str] | None`），与 `extractions.applicable_conditions` 同构。
- 迁移 `0006_entries_conditions`（down_revision `0005_source_attachments`）：
  - `batch_alter_table` 加列（与 0005 的 MySQL 兼容写法一致）；
  - 回填存量：`UPDATE entries SET applicable_conditions = (SELECT ex.applicable_conditions FROM extractions ex WHERE ex.id = entries.extraction_id) WHERE extraction_id IS NOT NULL`；
  - downgrade 删列。
- `confirmation.decide_extraction` 中把已计算好的 `conditions` 同时写入 `entry.applicable_conditions`。
- 理由：正式记录自包含，后续记录编辑、来源解耦时不必回查候选；与基线 D03 一致。

### 2. 节点记录接口与数量

- 新增 `GET /api/projects/{project_id}/nodes/{node_id}/entries`：
  - 先按 Workspace 校验项目，再校验节点属于该项目（复用 `get_project` 与节点查询），不暴露跨 Workspace 标识。
  - 返回 `NodeEntryResponse`：`id`、`entry_type`、`title`、`content`、`applicable_conditions`、`sources`（最多 3 个 `{id, source_type, title}`）、`created_at`；按创建时间倒序，仅已归档记录，上限 200。
  - 关联 Source 经 `entry_sources` 一次批量加载，避免 N+1。
- 节点列表 `GET /api/projects/{id}/nodes` 的 `NodeResponse` 增加 `entry_count: int = 0`：按 `node_id` 聚合已归档记录数，一次 `GROUP BY` 映射到全部节点。
- 理由：目录树需要轻量计数（C5），详情需要完整列表；两个端点职责单一。

### 3. Source 详情关联记录

- `SourceDetailResponse` 增加 `entries: list[RelatedEntry]`；`RelatedEntry`：`id`、`entry_type`、`title`、`project_id`、`node_id`、`created_at`。
- `get_source_detail` 经 `entry_sources` 关联加载该 Source 的已归档记录，按创建时间倒序。
- 理由：来源 -> 记录是溯源闭环的另一侧（F6），数据已在 `entry_sources` 中，仅缺读取与展示。

### 4. 前端节点详情记录区块

- 在 `ProjectDetailPage` 选中节点时的内容区，子节点区块下方新增"正式记录"区块：
  - 类型筛选 chips：全部 + 8 种记录类型（复用 `entryTypeLabels`），客户端过滤（节点记录量小，一次拉取）。
  - 记录卡片：类型徽标、标题、内容摘要（line-clamp）、适用条件（非空时"适用条件：…"）、来源标签（最多 3 个，点击跳 `/inbox/:sourceId`）、创建日期。
  - 空态："该节点还没有正式记录"；加载/失败态沿用现有 `state-panel` 模式。
  - 移动端同区块置于移动节点内容下方。
- 目录树行（桌面树 + 移动层级列表）在节点名旁显示 `entry_count`（>0 时）。
- 新增查询 hook `useNodeEntries(projectId, nodeId)`；`Node` 类型增加 `entry_count`。

### 5. 前端来源详情关联记录

- `SourceDetail` 类型增加 `entries`；`SourceConfirmPage` 在来源面板或页尾新增"关联正式记录"区块：每条显示类型徽标 + 标题，点击跳转 `/projects/:projectId/nodes/:nodeId`（无节点时 `/projects/:projectId`），与节点详情记录区块闭环。
- 无关联记录时不显示该区块或显示空提示（与来源详情页现状一致，倾向无记录时不展示）。

### 6. 测试与验证

- 后端：节点记录接口（正常列表、Workspace 隔离、仅已归档、倒序、来源与适用条件、上限）、节点列表 `entry_count`、Source 详情 `entries`、迁移 0006 升级/回滚与回填。
- 前端：节点详情记录区块（渲染、类型筛选、来源跳转、空态、失败重试）、节点记录数徽标、来源详情关联记录跳转。
- 验收：浏览器桌面与 390px 打开节点详情查看记录、点击来源/节点跳转；本地 MySQL 执行 `alembic upgrade head` 验证迁移。

## Risks / Trade-offs

- [JSON 列兼容性] → 与 `extractions.applicable_conditions` 同构，MySQL/SQLite 均已验证过该类型。
- [回填语句在 MySQL 的语义] → 相关子查询仅更新有 extraction 的行；无候选条件的行保持 NULL，前端按"无适用条件"处理。
- [节点记录量大导致前端一次拉取过重] → P0 单节点记录量小；上限 200 并提示，超出部分后续再做分页。
- [类型筛选在客户端而非服务端] → 数据量小、即时切换；服务端筛选留待 P1 组合筛选。

## Migration Plan

- 新增迁移 0006 并在本地 MySQL（`knowstruct_test`）执行 `alembic upgrade head`；回滚为 `alembic downgrade -1`（仅删列，不回写数据）。
- 部署顺序：后端 + 迁移先上，前端随后；老前端调用新接口前不依赖新字段（`entry_count`、`entries` 为增量字段）。

## Open Questions

- 无。范围已与用户确认：节点详情记录浏览 + 来源详情关联记录合并为一个切片，适用条件采用方案 B。
