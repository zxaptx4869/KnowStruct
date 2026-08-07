## Context

AI 审查已在 `codex/review-ai-detection` 分支实现（未合并）。体验修订集中在三处：范围选择交互、扫描状态跨页恢复、并发保护。数据模型不变（复用 `review_scans` / `review_ai_findings`），无新迁移。

## Goals / Non-Goals

**Goals:**
- 范围选择改为多层级树（项目 → 节点），点击项目或节点即定范围，无"全部工作区"。
- 切换页面后回到 Review 仍能看到最近扫描的进度/结果与候选，按钮禁用依据服务端状态。
- 同一工作区同时只允许一个进行中的扫描（后端 409 保护），worker 串行不变。

**Non-Goals:**
- 不做并行扫描、不做扫描历史列表页、不做定时扫描。
- 不改变候选确认边界与处理闭环。

## Decisions

### 1. 树形范围选择器

新组件 `ScopePicker`（`frontend/src/review/ScopePicker.tsx`）：

- 触发按钮显示当前选择（"请选择审查范围"或"项目 / 节点"路径）。
- 面板：项目列表（`useProjects`）为顶层，每项可展开加载节点（`useNodes(projectId)`，单次展开一个项目）；点击项目行 = 项目范围并收起；点击节点行 = 节点范围并收起。
- 桌面：绝对定位下拉面板；移动端（≤767px）：底部弹层（fixed 覆盖层），共用同一组件与状态。
- 选择存 localStorage（键 `knowstruct.review.scope.<userId>`，形状 `{project_id, node_id}`，`node_id` 为空表示项目范围）；读取时兼容旧格式。
- 未选择时点击"开始审查"提示"请选择审查范围"。

### 2. 扫描状态跨页恢复

- 后端新增 `GET /api/review/scans`（Workspace 隔离，按创建时间倒序，默认 10 条）；`ReviewScanResponse` 增加 `started_at`。
- 前端 `useRecentScans()`；页面挂载时若本地无 `activeScanId`，取最近一条扫描恢复：pending/running → 继续轮询显示进度；succeeded → 显示"最近一次扫描完成：发现 N 条候选"并展示该扫描候选；failed → 显示失败原因与重新扫描入口。
- "开始审查"按钮禁用条件 = 本地发起中 或 恢复出的扫描处于 pending/running。
- 扫描中面板显示开始时间与已用时（由 `created_at`/`started_at` 计算，随轮询刷新）。

### 3. 并发保护

- `POST /api/review/scans` 创建前查询该 Workspace 是否存在 pending/running 扫描，存在则 409 `scan_in_progress`（"已有扫描进行中，请等待完成"）。
- worker 保持一次一个任务的串行处理；失败/崩溃恢复沿用 stale 机制。

## Risks / Trade-offs

- [树面板在 390px 溢出] → 移动端固定底部弹层 + 内部滚动。
- [旧 localStorage 格式] → 读取时兼容转换（workspace → 空选择）。
- [恢复最近扫描可能不是用户想看的] → 面板明确标注"最近一次扫描"，重新开始会创建新扫描。

## Migration Plan

- 无数据模型变更、无迁移；后端仅加接口与校验，前端随版本发布。

## Open Questions

- 无。三点修订均已与用户确认。
