## Why

AI 审查上线前体验有三处不足：范围选择要"先选类型再选项目再选节点"，交互繁琐；开始审查后切换页面会丢失扫描进度与结果；并发保护只靠前端按钮禁用，存在堆叠扫描的漏洞。本修订把范围选择改为多层级树（无"全部工作区"选项）、扫描状态跨页面持久可恢复、并增加后端并发保护。

## What Changes

- 范围选择改为多层级树选择器：点击"审查范围"展开项目树，选中项目即项目范围、展开并选中节点即节点范围；不再提供"全部工作区"选项；桌面下拉、移动端底部弹层；仍记住上次选择。
- 扫描状态持久化：后端新增最近扫描列表接口（`GET /api/review/scans`），前端进入 Review 页自动恢复最近一次扫描——进行中则继续轮询，已完成则展示结果与候选；"开始审查"按钮禁用依据服务端最近扫描状态。
- 扫描中面板补充开始时间与已用时反馈。
- 并发保护：同一 Workspace 存在 pending/running 扫描时，再次发起扫描返回 409 并提示"已有扫描进行中"；worker 保持串行。

## Capabilities

### New Capabilities

### Modified Capabilities
- `review`: 修订"Run scoped AI review scans"需求——树形范围（项目/节点，无工作区）、扫描状态跨页恢复、并发保护与进度反馈。

## Impact

- 后端：`GET /api/review/scans` 列表接口、`POST /api/review/scans` 409 并发校验、`ReviewScanResponse` 补充 `started_at`。
- 前端：新增树形范围选择器组件（桌面下拉/移动弹层），Review 页恢复最近扫描、禁用逻辑改由服务端状态驱动、进度面板显示开始时间/已用时；类型与查询扩展。
- 主规格：实现后更新 `openspec/specs/review/spec.md`。
