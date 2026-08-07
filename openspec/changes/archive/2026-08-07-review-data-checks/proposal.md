## Why

知识库经过 P0 闭环积累后，用户需要能发现质量问题：正式记录缺来源、缺适用条件，或资料长期停在待确认。Review 是 P1 依赖链上的第一个切片，先实现不依赖 AI 的数据驱动检查，把"问题列表 → 证据 → 处理"闭环跑通，为后续 AI 重复/冲突检测打好界面与数据基础。

## What Changes

- 实时计算三类 Review 问题（按 Workspace 隔离）：缺来源（已归档 Entry 无任何来源关联）、缺适用条件（适用条件为空或空列表）、长期待确认（存在创建超过 7 天的待确认候选，按 Source 聚合显示条数）。
- 新增 `review_resolutions` 表（迁移 0007）记录"已解决/忽略"与备注；同一条问题唯一，支持撤销；问题数据修复后自动从待处理列表消失。
- 新增 API：`GET /api/review/findings`（按类型与状态筛选，返回含证据摘要的问题列表）、`POST/DELETE /api/review/findings/{type}/{target_type}/{target_id}/resolution`（标记处理、撤销，幂等）。
- 新增前端 `/review` 页面：待处理/已处理 tab、类型筛选、问题卡片内联展开证据详情（记录内容 / 来源 / 待确认条数）与跳转（去确认、编辑记录）、标记已解决/忽略（可写备注）、撤销处理；全局导航 Review 去掉 P1 徽标；桌面与 390px 移动端可用。
- 加载/失败/空态沿用现有状态模式；处理操作失败不改变当前状态，可重试。

## Capabilities

### New Capabilities
- `review`: Review 数据驱动问题检查与处理闭环（问题计算、处理记录、列表/详情/筛选、解决/忽略/撤销）。

### Modified Capabilities

## Impact

- 后端：新增 `ReviewResolution` 模型与 Alembic 迁移 0007、`app/services/review.py` 问题计算与处理服务、`app/api/review.py` 接口、schemas，及对应 pytest。
- 前端：新增 `frontend/src/pages/ReviewPage.tsx`、`frontend/src/review/`（types/queries）、路由注册与 Layout 导航徽标调整、样式与测试。
- 主规格：实现后新增 `openspec/specs/review/spec.md`。
- 依赖的现有主规格：`extraction-confirmation`（候选状态与适用条件）、`entry-maintenance`（记录字段与编辑跳转）、`search-and-trace-source`（跳转路径复用）。
