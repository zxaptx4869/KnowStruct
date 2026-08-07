## Why

扫描完成后存在两个体验问题：重新浮现的已处理问题不会自动出现在待处理列表（需整页刷新）；完成文案只显示"发现 0 条候选"，未体现"已处理问题重新浮现"，与实际结果有歧义。

## What Changes

- 扫描状态变为成功时，前端自动失效并刷新发现列表查询，重新浮现的问题无需刷新页面即出现在待处理列表（切 tab / 切导航也能看到）。
- `review_scans` 新增 `resurfaced_count`（迁移 0009），记录本次扫描重新浮现的已处理问题数；完成文案区分"新候选 N 条"与"已处理问题重新浮现 M 条"（M>0 时展示）。

## Capabilities

### New Capabilities

### Modified Capabilities
- `review`: 修订"Run scoped AI review scans"——扫描完成结果包含重新浮现数量；扫描成功后列表自动刷新。

## Impact

- 后端：迁移 0009、`ReviewScan.resurfaced_count`、`run_scan` 写入计数、`ReviewScanResponse` 返回；测试断言。
- 前端：`ReviewPage` 扫描成功时 invalidate findings 查询（带状态跃迁守卫）；完成文案；类型扩展；测试更新。
- 主规格：实现后更新 `openspec/specs/review/spec.md`。
