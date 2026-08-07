## Context

Review 扫描完成后，`_resurface_handled_in_scope` 在服务端清除了处理记录，但前端 findings 查询缓存未失效，页面需整页刷新才能看到重新浮现的问题；完成面板只显示候选数。

## Goals / Non-Goals

**Goals:**
- 扫描成功即刷新发现列表，重新浮现问题立即可见（无需刷新/切 tab/切导航）。
- 完成文案区分新候选与重新浮现数量。

**Non-Goals:**
- 不改变重新浮现的判定逻辑（仍为扫描范围内的确定性检查）。

## Decisions

### 1. resurfaced_count 字段（迁移 0009）

`review_scans.resurfaced_count INTEGER NOT NULL DEFAULT 0`；`run_scan` 将 `_resurface_handled_in_scope` 返回值写入；`ReviewScanResponse` 返回给前端。

### 2. 前端失效与文案

- 新增 `reviewKeys.findingsBase = ['review','findings']`；ReviewPage 用 ref 记录上次扫描状态，扫描状态跃迁到 succeeded 时 `invalidateQueries(findingsBase)`（不失效扫描查询，避免循环）。
- 完成文案：`扫描完成：发现 N 条新候选`，`resurfaced_count > 0` 时追加 `，M 条已处理问题已重新浮现`；截断提示保留。

## Risks / Trade-offs

- [invalidate 触发额外请求] → 仅扫描完成时一次，开销可忽略。

## Migration Plan

- Alembic 迁移 0009 加列；回滚 drop 列。

## Open Questions

- 无。两点均为用户提出并确认修复方向。
