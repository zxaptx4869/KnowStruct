## Context

AI 发现保存在 `review_ai_findings`（status: candidate/open/rejected），处理记录存于 `review_resolutions`（target_type=ai_finding）。当前扫描去重仅按 `status != rejected` 跳过同配对，导致已解决/忽略的发现即使数据未修复也不再出现。

## Goals / Non-Goals

**Goals:**
- 扫描即体检：数据未修复的已处理 AI 问题在下次扫描时重新浮现。
- 已确认未处理的配对不重复生成候选；已拒绝配对维持可复活为候选。

**Non-Goals:**
- 不改变数据驱动检查（缺来源/缺条件）的处理语义。
- 不新增"永久忽略"状态（后续按需再加）。

## Decisions

### 去重分支（`_create_candidates`）

对检测到的 `(workspace, review_type, entry_a, entry_b)` 配对：

| 现有发现状态 | 行为 |
|---|---|
| candidate | 跳过（已是候选） |
| open | 跳过（不重复生成候选；已处理与否由扫描完成时统一处理） |
| rejected | 复活为候选（更新 scan/描述/严重度） |

### 扫描完成时的确定性重新浮现（`_resurface_handled_in_scope`）

扫描批次完成后，对扫描覆盖范围内的已确认发现（两条记录都在范围内且仍存在）检查处理记录：

- 存在已解决/忽略记录 → 删除处理记录，问题重新出现在待处理（保持 open，不重复确认）。
- 两条记录不在扫描范围内（如只扫了其他节点）→ 不处理，保持已处理状态。

该机制不依赖 AI 是否再次检测到同一配对，保证"数据未修复时重新浮现"的确定性；处理记录查询按 Workspace 隔离，删除随扫描事务提交；不新增字段与迁移。

## Risks / Trade-offs

- [用户"暂时不想看"会被下次扫描打断] → 扫描是手动触发，浮现仅发生在用户主动再审查时；必要时后续加"永久忽略"。

## Migration Plan

- 无迁移；随扫描逻辑发布。

## Open Questions

- 无。方案 A 已与用户确认。
