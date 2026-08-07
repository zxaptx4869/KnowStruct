## Context

P0 闭环已就绪：Entry（含 `applicable_conditions` JSON 列表）、Source、Extraction（状态 `pending_confirm/accepted/rejected`）、`entry_sources` 关联表均可按 Workspace 查询。全局导航已存在 `/review` 占位（带 P1 徽标），尚无路由与页面。本切片实现 Review 的数据驱动检查：缺来源、缺适用条件、长期待确认，以及"问题 → 证据 → 处理"闭环。

## Goals / Non-Goals

**Goals:**
- 打开 Review 页即可实时看到三类问题，证据与跳转齐全。
- 支持标记已解决/忽略（可写备注）、已处理列表与撤销；处理操作幂等。
- 数据修复后问题自动消失，处理记录不污染业务数据。
- 桌面与 390px 移动端一致的列表/筛选/详情体验。

**Non-Goals:**
- 不做 AI 重复/冲突检测与原因解释（第二切片）。
- 不做定时 Review、信息过期、高风险节点、决策依据充分性检查（P2）。
- 不做 Review 修改建议（H8）。

## Decisions

### 1. 问题实时计算 + 轻量处理记录表

问题在请求时由查询计算，不引入后台扫描任务；"已解决/忽略"写入独立表 `review_resolutions`：

- 问题稳定键：`(finding_type, target_type, target_id)`。
- 待处理列表 = 实时查询结果 − 已有处理记录；已处理列表 = 处理记录 join 目标对象（目标已删除时展示摘要并允许撤销）。
- 数据修复后对应问题自动消失，残留处理记录无害。
- 备选：持久化 findings 快照 + 定时扫描——需要任务编排与状态同步，超出本切片比例，否决。

### 2. 检查口径（Workspace 内）

| finding_type | target | 判定 |
|---|---|---|
| `missing_source` | entry | `status = archived` 且 `entry_sources` 无关联 |
| `missing_conditions` | entry | `applicable_conditions` 为 NULL 或空列表 |
| `long_pending` | source | 该 Source 存在 `status = pending_confirm` 且 `created_at` 超过 7 天的候选；按 Source 聚合，返回待确认条数 |

7 天阈值先以模块常量实现（`LONG_PENDING_DAYS = 7`），后续再做可配置。

### 3. 处理记录表结构与语义

```text
review_resolutions
  id, workspace_id, finding_type, target_type ('entry'|'source'),
  target_id, resolution ('resolved'|'ignored'), note (nullable),
  created_at, updated_at
  UNIQUE (workspace_id, finding_type, target_type, target_id)
```

- 标记处理 = upsert 该唯一行；撤销 = 删除该行（问题回到待处理）。
- 不记录操作用户（单用户 Workspace，审计后续再加）。

### 4. API 设计

- `GET /api/review/findings?status=open|resolved&type=missing_source|missing_conditions|long_pending`
  - 返回 `{ findings: [...] }`，每项含稳定键、类型、目标摘要（Entry 标题/内容/条件/项目/节点路径，Source 标题/类型/待确认条数）、证据跳转所需 id、创建时间与处理信息。
- `POST /api/review/findings/{type}/{target_type}/{target_id}/resolution` body `{ resolution, note? }` → upsert，幂等。
- `DELETE /api/review/findings/{type}/{target_type}/{target_id}/resolution` → 撤销。
- 全部以 `auth.workspace.id` 过滤，跨 Workspace 目标按不存在处理。

### 5. 前端 /review 页面

- 顶部：待处理 / 已处理 tab；类型筛选（全部 + 三类）。
- 问题卡片：类型徽标、目标标题、摘要、时间；点击展开内联详情（完整证据 + 跳转按钮）。
- 跳转：长期待确认 → `/inbox/:sourceId`（确认页）；缺来源/缺条件 → 所属节点或项目页。
- 动作：标记已解决、忽略（可输入备注）；已处理 tab 支持撤销。
- 失败/加载/空态沿用现有 `state-panel` 模式；操作失败 toast 且状态不变。
- 导航：Layout 中 `/review` 项移除 P1 徽标并注册路由。

## Risks / Trade-offs

- [计算查询随数据量增长变慢] → P0 规模下三表索引已覆盖；后续 P1 可加物化或任务化。
- [处理记录与数据状态可能不同步] → 设计上允许（修复即消失）；已处理列表以记录为主，撤销后可复核。
- [缺来源在正常流程下较少出现] → 保留为溯源不变量检查（H1），出现即提示。
- [阈值写死 7 天] → 模块常量集中管理，后续配置化不破坏接口。

## Migration Plan

- Alembic 迁移 0007：新建 `review_resolutions` 表（含唯一约束与 Workspace 索引）；MySQL 真实验证。
- 回滚：`alembic downgrade` 移除该表；接口 404 时前端回到空态。

## Open Questions

- 无。问题模型、7 天阈值、已处理与撤销均已与用户确认。
