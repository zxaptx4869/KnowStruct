## Why

AI 审查的"候选确认"步骤拉长了用户操作路径（审查 → 候选 → 确认/拒绝 → 待处理），且未处理候选存在可见性盲区。改版为：AI 发现直接进入待处理，用户在待处理内用"标记已解决 / 拒绝"做决定，并把状态收敛为待处理 / 已处理 / 已拒绝三态；同时新增"审查记录"tab，让每次审查的时间、耗时与结果不再"盲盒"。

## What Changes

- 移除候选确认步骤：AI 审查发现直接以 open 状态进入待处理列表；删除候选确认相关 API 与前端候选区块。
- 三态：待处理（无处理记录）/ 已处理（resolution=resolved）/ 已拒绝（resolution=rejected）；待处理动作改为"标记已解决 / 拒绝"，移除"忽略"；已处理与已拒绝均支持撤销/恢复。
- 重新审查去重：同配对已解决 → 清除处理记录、问题重新出现在待处理；已拒绝 → 不再报问题，但在本次审查结果中体现"跳过已拒绝 K 条"；待处理 → 跳过。
- 缺来源 / 缺适用条件与 AI 问题同等处理（也可拒绝）；移除"长期待确认"检查。
- 新增"审查记录"tab：每条显示开始/结束时间、耗时（结束−开始）、范围名称、状态、新问题数、重新浮现数、跳过已拒绝数、决策跟进（已解决 X · 已拒绝 Y · 待决定 Z）、失败原因；分页（每页 20，加载更多，返回总数）。
- 审查页中间区域（范围栏与扫描状态条）紧凑化，降低纵向占用。

## Capabilities

### New Capabilities

### Modified Capabilities
- `review`: 重构"Confirm AI candidate findings"（改为直接进入待处理与三态）、"Run scoped AI review scans"（去重语义、结果计数、审查记录）、"Manage finding resolutions"（新增 rejected）、"Compute data-driven review findings"（移除长期待确认）；新增"Review scan history"需求。

## Impact

- 后端：迁移 0010（`review_ai_findings.status` 收敛为 open、`review_resolutions.resolution` 增加 rejected、`review_scans.skipped_rejected_count`、旧 candidate/rejected 数据迁移）；移除候选/决定接口；findings 支持 rejected 视图；扫描列表增加范围名、耗时、决策跟进与分页。
- 前端：四 tab（待处理/已处理/已拒绝/审查记录）、拒绝/恢复动作、移除候选区块与长期待确认、扫描结果文案（新问题/重新浮现/跳过已拒绝）、审查记录分页、紧凑化样式。
- 主规格：实现后更新 `openspec/specs/review/spec.md`。
