## Context

正式记录（Entry）已具备：Workspace 隔离、归档节点（`node_id`）、`entry_sources` 来源关联、自包含的 `applicable_conditions`（迁移 0006）。节点详情已有记录浏览与来源关联展示。本 Change 补齐记录的编辑与删除，使记录生命周期从"只能创建"变为"可维护"。

## Goals / Non-Goals

**Goals:**
- 编辑记录的标题、内容、类型、适用条件，并可改归档节点（同项目内任意节点或清空为未归档）。
- 单条删除记录；删除不影响原始 Source 与 Extraction；节点记录数、搜索、来源关联记录自动更新。
- 编辑 / 删除入口位于节点详情记录卡片，桌面与移动端可用；失败保留输入。

**Non-Goals:**
- 不做跨项目移动记录（保持 Entry 的 project 归属不变）。
- 不做修改历史 / 版本回滚（F8，P1）；编辑直接覆盖。
- 不做批量编辑 / 删除（F9，P1）。
- 不重置被删记录对应 Extraction 的候选状态（保留 AI 确认历史）。
- 不在来源详情页提供编辑 / 删除入口（本切片仅节点记录卡片）。

## Decisions

### 1. 编辑接口：`PATCH /api/projects/{project_id}/entries/{entry_id}`

- 校验链：`get_project(workspace, project_id)` -> `Entry` 按 `id` + `workspace_id` + `project_id` 查询，不满足按 404 处理（不暴露跨 Workspace 标识）。
- `EntryUpdate` 全部字段可选但 MUST 至少提交一个字段（`require_change`，与 `NodeUpdate` 模式一致）：
  - `title`：去空白后 1-200 字符；
  - `content`：去空白后 1-20000 字符；
  - `entry_type`：8 种记录类型之一；
  - `applicable_conditions`：字符串列表或 `null`（null 表示清空）；
  - `node_id`：`null`（清空为未归档）或同项目内节点 id；节点属于其他项目时返回 `invalid_node_for_project`，不修改记录。
- 响应返回更新后的 `NodeEntryResponse`（含关联来源），前端可直接刷新卡片。
- 编辑不写回 Extraction：Extraction 保留 AI 候选与确认时的原貌，作为追溯历史；正式记录已自包含（0006），不再依赖候选。

### 2. 删除接口：`DELETE /api/projects/{project_id}/entries/{entry_id}`

- 校验链同上，成功返回 204。
- `db.delete(entry)`：`entry_sources` 由外键 `ondelete=CASCADE` 一并移除；Source 与 Extraction 行保留。
- 节点记录数（`entry_count` 聚合）、搜索、来源详情关联记录均为实时查询，删除后自动更新，无需额外清理。
- 重复删除或跨 Workspace 删除按 404 处理。

### 3. 前端入口与交互

- 记录卡片头部右侧增加操作按钮（`MoreHorizontal`，`aria-label="管理记录：{title}"`），沿用目录节点的 `action-menu` 模式：
  - "编辑记录"：打开 `EntryEditDialog`。
  - "删除记录"（danger）：打开删除确认（复用 `ConfirmDialog`），文案"该记录将永久删除，原始来源会保留。"。
- `EntryEditDialog` 字段：标题（input）、记录类型（select，复用 `entryTypeOptions`）、内容（textarea）、适用条件（input，分号分隔，与确认页一致）、归档节点（select：项目全部节点 + "未归档"）。
  - 提交失败保留输入并显示错误（复用 `mutationMessage`），与 `NodeDialog` 行为一致。
- 查询：`projects/queries.ts` 新增 `useUpdateEntry(projectId, entryId)` 与 `useDeleteEntry(projectId)`；成功后失效 `entries` 与 `nodes` 查询（记录列表与计数），来源详情页下次加载自然刷新。
- 移动端：菜单按钮定位逻辑复用现有 `NodeMenu` 思路（简单下拉，不做 portal 定位的复杂计算也可接受，控制在卡片内）。

### 4. 测试

- 后端 `tests/test_entry_maintenance.py`：
  - 编辑：各字段更新、空白标题 / 空内容 / 未提交字段拒绝、同项目节点合法、跨项目节点冲突、清空节点、Workspace 隔离 404、响应含来源。
  - 删除：204 后 Entry 与 `entry_sources` 消失、Source 与 Extraction 保留、节点 `entry_count` 更新、重复 / 跨 Workspace 删除 404。
- 前端 `ProjectDetailPage.test.tsx`：
  - 打开编辑对话框并保存触发 PATCH、失败保留输入；
  - 打开删除确认并确认触发 DELETE；
  - 菜单可访问性与卡片渲染不受影响。

## Risks / Trade-offs

- [级联删除依赖外键] → `entry_sources` 已定义 `ondelete=CASCADE`；SQLite 测试已启用外键，MySQL 行为一致。
- [删除后 Extraction 仍为 accepted] → 设计上保留确认历史；如需"删除记录后可重新确认候选"留作 P1，本切片不引入回退逻辑。
- [编辑不写回 Extraction] → 正式记录自包含后不依赖候选；来源页与确认页仍展示候选原貌，属预期。
- [跨项目移动不做] → 避免 Source / Project 归属语义复杂化；后续 P1 如需，单独切片处理。

## Migration Plan

- 无数据模型变更、无迁移；后端接口与前端随版本发布，回滚即回退提交。

## Open Questions

- 无。子问题已与用户确认：同项目内移节点、单条删除保留来源、卡片操作菜单、直接覆盖不做历史。
