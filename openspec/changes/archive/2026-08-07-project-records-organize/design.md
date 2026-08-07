## Context

当前正式记录只有节点级列表（`GET /projects/{id}/nodes/{nodeId}/entries`）：未归档记录（node_id 为空）不在任何节点下，项目内无聚合视图，只能靠全局搜索找到且没有编辑入口。后端已支持单条编辑改归档节点（`PATCH /projects/{id}/entries/{entryId}` 的 `node_id` 可空），前端已有可复用的「编辑记录」对话框（含归档节点下拉）。本 Change 补齐项目级列表与整理模式，并新增批量移动/删除。

## Goals / Non-Goals

**Goals:**
- 未归档记录在项目内可见、可筛、可补录归档。
- 项目工作区提供查看/整理双模式：查看模式维持现状；整理模式以目录树为单选筛选器，支持多选批量移动/删除。
- 编辑与批量操作即时落库；「回到查看」纯退出，不承担保存。
- 桌面与移动端一致可用（移动端不做批量条）。

**Non-Goals:**
- 修改历史（F8）、标签/结构化字段（F7）、搜索组合筛选（G4）、候选批量确认（E14）。
- 批量修改记录状态、跨项目批量、记录草稿缓存式编辑。
- 大列表分页（本切片上限 200 条 + 准确计数，分页留待后续）。

## Decisions

### 1. 后端项目记录列表与统计
- 新增 `GET /projects/{project_id}/entries`，返回 `{ items, total, unarchived_count }`：
  - items 为该 Workspace 项目全部 Entry（含未归档），按 `created_at desc, id desc`，上限 200；
  - 每条含 `node_path`（由项目节点树在服务端拼出，未归档为空列表）与 `sources` 数量；
  - 复用现有 `NodeEntryResponse` 并增加 `node_path` 字段。
- `ProjectResponse` 增加 `entry_count`、`unarchived_entry_count`：项目列表与详情一次聚合（按 workspace 内 projects group by 计数）。
- 备选：分页。否决：当前数据量小，先保证计数准确 + 列表上限，避免前端分页复杂度。

### 2. 查看/整理双模式（URL 为唯一状态源）
- URL query：查看模式 `?mode=view`（默认），整理模式 `?mode=organize&filter=all|unarchived|<nodeId>`。
- 查看模式：点目录树 = 导航到 `/projects/{id}/nodes/{nodeId}`（现状不变）。
- 整理模式：点目录树 = 仅更新 `filter`，不导航；树为单选筛选器，顶部两个伪选项「全部记录」（filter=all）、「未归档」（filter=unarchived）；再次点击已选中的节点 = 回到 all。
- 模式按钮：查看模式「批量整理」，整理模式「回到查看」；移动端同样提供（放移动端头部）。
- 备选：本地 state。否决：刷新/后退会丢状态，且与树导航混在一起易出双状态 bug。

### 3. 批量操作端点（原子整批）
- `POST /projects/{project_id}/entries/batch/move` `{ entry_ids, node_id | null }`：`node_id=null` 表示批量清空归档（移动到未归档）。
- `POST /projects/{project_id}/entries/batch/delete` `{ entry_ids }`。
- 校验顺序：非空且 ≤100 → 全部存在且属于当前项目 → 目标节点属于当前项目（move）→ 任一不满足整批拒绝；沿用 Source 批量的原子语义。
- 删除沿用单条语义：删除 Entry 与 `entry_sources` 关联，保留原始 Source/Extraction。
- 备选：逐条跳过汇总。否决：与既有批量交互（采集箱）保持一致，整批失败提示更明确。

### 4. 即时落库与计数刷新
- 单条编辑与批量操作均即时提交；成功/失败提示沿用现有 toast/对话框模式。
- 批量移动/删除后失效项目记录列表与相关节点记录查询，计数即时更新。
- 「回到查看」不触发任何写请求。

### 5. 移动端
- 移动端头部提供「批量整理/回到查看」按钮；整理模式下列表用卡片（复用 record-card），支持「未归档」黄标与单条编辑；不渲染多选/批量条。

## Risks / Trade-offs

- [记录超过 200 条时列表截断] → 计数仍准确，列表上限与既有采集箱一致，分页留待后续。
- [目录树在两种模式下语义不同] → URL 模式 + filter 为唯一状态源；组件按 mode 分发点击行为，避免状态分叉。
- [批量移动并发编辑同一记录] → 与单条编辑一致（无额外锁）；跨项目节点校验在事务内完成。
- [项目列表聚合计数增加查询开销] → 单条 group-by 聚合，可接受。

## Migration Plan

- 无数据库迁移；仅新增接口与前端状态。
- 发布顺序：后端接口先行，前端联调同分支提交。
