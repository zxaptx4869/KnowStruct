## Context

Review 现有模型：AI 发现 → candidate → 确认（open）/拒绝；解决/忽略走 `review_resolutions`；数据驱动检查含缺来源/缺适用条件/长期待确认。改版目标：去掉候选层，收敛三态，并补齐审查记录。

## Goals / Non-Goals

**Goals:**
- AI 发现直接进待处理，操作路径最短；待处理内只有"标记已解决 / 拒绝"两个决定。
- 三态 tab（待处理/已处理/已拒绝）清晰可查，均支持撤销/恢复。
- 重新审查：已解决且数据未修复 → 重新浮现；已拒绝 → 永久跳过并在结果中计数。
- 审查记录展示每次审查的时间、耗时与结果，分页加载。

**Non-Goals:**
- 不做定时扫描、不做候选确认 UI、不做"永久忽略"（已拒绝即永久）。

## Decisions

### 1. 三态统一用处理记录表示

`review_ai_findings.status` 收敛为 `open`（迁移 0010 把旧 candidate/rejected 转为 open，并为旧 rejected 补写 `resolution='rejected'` 处理记录）。"已解决 / 已拒绝"统一由 `review_resolutions.resolution`（resolved / rejected，ignored 为历史遗留不再使用）表示：

| 视图 | 来源 |
|---|---|
| 待处理 | 数据驱动发现 + AI open 发现，排除任何处理记录 |
| 已处理 | `resolution='resolved'` 的处理记录（目标为 entry/source/ai_finding） |
| 已拒绝 | `resolution='rejected'` 的处理记录 |

数据驱动与 AI 问题同一套处理记录机制，UI 上"拒绝"行为一致。

### 2. 重新审查去重（`run_scan`）

对检测到的 `(workspace, review_type, entry_a, entry_b)`：

| 现有发现 | 行为 | 计数 |
|---|---|---|
| 不存在 | 直接创建 open 发现 | findings_count+1 |
| 存在且无处理记录 | 跳过（已在待处理） | — |
| 存在且 resolution=resolved | 清除处理记录 | resurfaced_count+1 |
| 存在且 resolution=rejected（或历史 ignored） | 跳过 | skipped_rejected_count+1 |

### 3. 审查记录（`GET /api/review/scans`）

- 分页：`limit`（默认 20，最大 100）+ `offset`，返回 `{ scans, total }`。
- 每条补充：`scope_name`（项目/节点名，已删为 null）、`duration_seconds`（`finished_at − created_at`，进行中为 null）、`skipped_rejected_count`、`decision_summary { resolved, rejected, pending }`（按 scan 统计发现当前状态）。
- 前端"审查记录"tab 每页 20 条，底部"加载更多"；扫描完成时刷新该列表。

### 4. 移除内容

- 候选确认 API（`/scans/{id}/candidates`、`/findings/ai/{id}/decision`）与前端候选区块、决策跟进 UI 移除。
- `long_pending` 检查从计算中移除（枚举与约束保留以兼容历史记录）。
- "忽略"按钮移除；历史 ignored 记录保留不展示。

### 5. 中间区域紧凑化

- 范围栏（`.review-scan-bar`）减少 padding/margin；扫描状态条改为单行紧凑样式（小号文字、窄内边距），整体降低纵向占用。

## Risks / Trade-offs

- [拒绝后想再看] → 已拒绝 tab 支持"恢复"（删除处理记录回到待处理）。
- [旧 candidate 数据升级为 open] → 与"直接进待处理"新语义一致；旧 rejected 补写处理记录保留拒绝意图。
- [每 scan 决策统计 N+1] → limit 20 内可接受；必要时后续合并查询。

## Migration Plan

- Alembic 迁移 0010：加 `review_scans.skipped_rejected_count`；重建 `review_ai_findings.status` CHECK 为 ('open') 并迁移数据；重建 `review_resolutions.resolution` CHECK 增加 'rejected'。
- 回滚：还原三处变更；数据迁移不可逆（旧状态已合并），降级仅用于开发环境。

## Open Questions

- 无。用户已确认：去候选、三态、拒绝永久跳过并计数、数据驱动同等处理、移除长期待确认、审查记录分页、中间区域紧凑化。
