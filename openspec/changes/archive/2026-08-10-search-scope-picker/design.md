## Context

搜索页已支持 `project` / `type` / `node` 组合筛选（2026-08-10 归档并同步主规格），
当前 UI 为「项目」「类型」「节点」三个下拉。Review 页已有 ScopePicker 组件
（`review/ScopePicker.tsx`），以触发按钮 + 项目列表 + 展开节点树的交互选择审查范围。

## Goals / Non-Goals

**Goals:**

- 搜索页范围选择与 Review 审查范围交互一致：一个控件完成「全部 / 项目 / 项目内节点」。
- 共享组件抽取后 Review 页行为与样式不变。
- URL 参数、后端接口、触发语义与历史记录语义保持不变。

**Non-Goals:**

- 后端参数/校验不变；不改类型筛选；不改 URL 参数命名。
- 不做范围多选或子树聚合。

## Decisions

### 1. ScopePicker 抽取为共享组件

将 `review/ScopePicker.tsx` 迁移到 `components/ScopePicker.tsx`，值类型保持
`{ project_id?: string | null; node_id?: string | null }`（与 ReviewScopeSelection
结构一致），新增两个可选 props：

- `placeholder`：未选择时的触发文案，Review 默认「请选择审查范围」，搜索页传「全部项目」。
- `allowClear`：为 true 时面板顶部渲染「全部项目」行，点击回到空选择。

ReviewPage 只改 import 路径，其余调用与默认行为不变；复用 `review-scope-*` CSS，
避免样式回归。

### 2. 搜索页接入

- 范围值直接由 URL 派生：`{ project_id: urlProject || null, node_id: urlNode || null }`。
- 选择项目 → 设置 `project`、删除 `node`；选择节点 → 同时设置两者；
  选择「全部项目」→ 删除两者。变更沿用 `updateFilters` 合并 URL 参数。
- 类型筛选保留独立下拉；「清除筛选」按钮保留（同时清范围与类型）。
- 节点选项仍复用 `useNodes(projectId)`；展开项目时按需加载，与 Review 一致。

### 3. 触发语义与 URL

- 已展示结果时变更范围立即重搜；未输入关键词时不请求（既有 useSearch queryKey 机制）。
- URL 参数名保持 `q` / `project` / `type` / `node`，刷新与前进后退恢复不变。

## Risks / Trade-offs

- [共享组件影响 Review 页] → Review 测试全量回归 + 桌面/移动验收；组件 API 保持兼容，
  仅新增可选 props。
- [「全部项目」与「请选择审查范围」两种占位文案共存] → 通过 `placeholder` 参数区分，
  Review 调用不传该参数保持原文案。
- [范围选择器宽度在移动端溢出] → 复用 `review-scope-*` 已有 390px 响应式样式，验收时
  检查横向溢出。

## Migration Plan

无数据库迁移。前端同版发布即可；回滚为撤销本分支合并。
