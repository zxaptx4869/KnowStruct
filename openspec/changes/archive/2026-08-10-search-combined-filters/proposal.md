## Why

全局搜索目前只有全文关键词，结果跨项目、跨记录类型混排。装修资料达到几十上百条后，
用户难以快速收窄到「某项目 + 某类型」或「某项目某节点」的范围，检索噪音直接拉高
「找到已整理知识」的成本，影响 P0/P1 核心闭环的日常可用性。

## What Changes

- 全局搜索接口 `GET /api/search` 新增可选筛选参数：项目 `project`、记录类型 `type`、项目内节点 `node`；
  筛选与关键词组合生效，非法参数返回可读错误。
- 搜索页新增筛选控件：项目、记录类型、项目内节点；节点选项随所选项目联动，切换项目时节点重置；
  筛选状态持久化到 URL query（`?q=&project=&type=&node=`），刷新与前进后退保持。
- 触发语义：已有搜索结果时变更筛选立即重新搜索；未发起过搜索（关键词为空）时只更新 URL 与界面状态，
  不发起请求；关键词输入保持显式提交。
- 筛选语义：类型与节点筛选只约束正式记录（Entry）结果；来源命中仍按关键词与项目筛选返回；
  节点筛选不含子树，只匹配归档在该节点下的记录。未分配项目的 Source 在项目筛选下不出现。
- 搜索结果的排序、每类 50 条上限、命中高亮、Entry 优先与来源证据、最近搜索历史（仅按关键词记录）
  等既有行为不变。

## Capabilities

### New Capabilities

（无，不引入新能力域）

### Modified Capabilities

- `search-and-trace-source`: 在现有 Workspace 关键词搜索能力上，新增组合筛选
  （项目/记录类型/节点）的参数、校验、结果语义与页面交互要求。

## Impact

- 后端：`backend/app/api/search.py`（新增查询参数）、`backend/app/services/search.py`
  （参数校验与过滤条件）、`backend/app/schemas/search.py`（响应不变，筛选仅影响查询）。
- 前端：`frontend/src/pages/SearchPage.tsx`（筛选控件与 URL 同步）、
  `frontend/src/search/queries.ts`（queryKey 与请求参数加入筛选）、搜索页样式与测试。
- 测试：后端 pytest 覆盖筛选参数校验与组合过滤；前端 vitest 覆盖筛选交互、URL 恢复与移动端布局。
- 数据模型：无迁移。筛选全部复用 Entry/Source 现有字段（project_id、entry_type、node_id）。
- 依赖的主规格：`openspec/specs/search-and-trace-source/spec.md`；
  详细文档路由：`功能结构图与优先级.md` 第 4.3 节（搜索与发现 G4）。

## Appetite

中等切片，约 1-2 天（含自动化测试与桌面/移动真实验收）。不包含语义搜索、状态筛选、
保存搜索、结果分页扩展、筛选入搜索历史等后续优先级内容。

## Non-Goals

- 状态筛选：搜索结果只返回已归档 Entry，状态维度无筛选价值；Source 处理状态筛选本次不做。
- 语义搜索、保存搜索、按项目外维度分组的聚合结果。
- 筛选记录进入最近搜索历史（历史仍按关键词去重记录）。
- 节点子树聚合、节点多选、结果排序或分组变化。
- 修改项目记录列表、整理模式等既有页面的筛选行为。
