## Why

用户在日常搜索中反复输入相同关键词（如装修场景的“冰箱”），且无法回顾之前搜过什么；搜索页空态只有一句静态引导，信息价值低。用轻量的本地“最近搜索历史”降低重复输入成本，并让历史可回溯、可清理。

## What Changes

- 搜索页空态展示“最近搜索”列表（最多 8 条）；无历史时保持现有“输入关键词开始搜索”引导。
- 历史存储于浏览器 localStorage，按认证用户隔离，纯前端能力，不涉及后端与迁移。
- 点击历史项回填输入框并重新搜索；同一关键词（trim 后精确匹配）去重置顶，不产生重复项。
- 搜索请求成功返回（含无结果）即记录该关键词；空词/纯空白不记录；搜索失败不记录；URL 恢复关键词触发的搜索同样记录。
- 支持单条删除与一键清空；清空无需二次确认；历史项不显示时间。
- 历史相关操作失败（localStorage 异常）时静默降级，不影响搜索主流程。

## Capabilities

### New Capabilities
- `recent-search-history`: 搜索页最近搜索历史的本地存储、展示、去重置顶、单条删除与清空行为。

### Modified Capabilities
- `search-and-trace-source`: 搜索页空态交互从“仅显示引导”扩展为“有历史时显示最近搜索，无历史时显示引导”；两种情况下均不发起搜索请求。

## Impact

- 前端：`frontend/src/pages/SearchPage.tsx`（空态渲染与记录时机）、新增 `frontend/src/search/history.ts`（纯逻辑）与对应测试、搜索页样式类。
- 后端：无接口、无数据模型、无迁移改动。
- 主规格：实现完成后同步 `openspec/specs/search-and-trace-source/spec.md` 空态需求，并新增 `openspec/specs/recent-search-history/spec.md`。
- 依赖的现有主规格：`search-and-trace-source`（搜索页交互状态）、`password-authentication`（按用户隔离的认证上下文）。
