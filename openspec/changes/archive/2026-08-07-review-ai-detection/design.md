## Context

Review 第一切片已实现数据驱动检查（缺来源 / 缺适用条件 / 长期待确认），问题模型为"实时计算 + `review_resolutions` 处理记录"。AI Provider 抽象早已预留 `review(entries) -> list[ReviewResult]`（含 review_type / description / related_entry_ids / suggestion / severity），但真实 Provider 尚未实现。本切片在其上补齐 AI 重复/冲突检测：手动范围扫描、候选确认、与现有处理闭环合并。

## Goals / Non-Goals

**Goals:**
- 用户在选定范围内手动触发扫描（全部工作区 / 指定项目 / 指定节点），扫描异步执行并可在页面跟踪状态。
- AI 产出重复/冲突发现作为候选，逐条确认/拒绝；确认后进入 Review 待处理，拒绝即丢弃。
- AI 问题与数据驱动问题统一列表与处理（解决/忽略/撤销），详情可对比两条记录并跳转。
- 重复扫描不重复生成同配对候选；未配置 AI 时失败可重试；范围过大时明确提示。

**Non-Goals:**
- 不做定时/自动扫描与增量扫描（后续优化）。
- 不做"接受 AI 建议自动修改记录"（只展示 suggestion）。
- 不做信息过期、高风险节点、决策依据不足等 P2 检查。
- 不改变数据驱动检查的口径与现有处理记录机制。

## Decisions

### 1. 手动扫描 + 异步 worker

Review 页"开始审查"创建 `review_scans` 记录（status=pending），进程内 worker 循环新增扫描分支：领取、置 running、执行、置 succeeded/failed；`claimed_at`/`recover_stale` 沿用 `ProcessingTask` 模式（容忍 worker 崩溃）。

- 理由：与 OCR/AI 提取的任务模型一致，长耗时 AI 调用不阻塞请求；复用现有容错。
- 备选：请求内同步扫描——AI 调用可能数十秒，请求超时与重试体验差，否决。

### 2. 扫描范围与配对

扫描范围由 `scope_type`（workspace/project/node）+ `scope_id` 决定，存于扫描记录：

- 范围确定该 Workspace 的已归档 Entry 集合；**同节点分组**（`node_id` 相同；均为 NULL 且同项目视为一组）。
- 每组条目批量调用一次 `provider.review(entries)`（每批 ≤ 30 条），AI 返回的 `related_entry_ids` ≥ 2 的 duplicate/conflict 结果转为发现。
- 单次扫描总条目上限 `SCAN_ENTRY_LIMIT = 100`；超出时按组截断并置 `truncated=True`，界面提示"本次达到上限，建议缩小范围"。
- 理由：同节点内比对语义相关性强、成本可控；条目级上限比"对数"更直观。

### 3. 候选确认边界

`review_ai_findings` 状态机：`candidate` →（确认）`open` /（拒绝）`rejected`。

- 确认后才出现在待处理列表；拒绝即丢弃且不在已处理列表。
- 去重键 `(workspace_id, review_type, entry_a_id, entry_b_id)`：新扫描发现已存在非 rejected 的相同配对时跳过；已 rejected 的可再次生成。
- 理由：AI 输出始终是候选（产品守则），确认动作即"人工接受"，拒绝可反悔（再扫描）。

### 4. 数据模型与处理闭环合并

```text
review_scans
  id, workspace_id, scope_type ('workspace'|'project'|'node'), scope_id (nullable),
  status ('pending'|'running'|'succeeded'|'failed'), claimed_at, started_at,
  finished_at, last_error, truncated (bool), findings_count, created_at, updated_at

review_ai_findings
  id, workspace_id, scan_id, review_type ('duplicate'|'conflict'),
  entry_a_id, entry_b_id (FK entries, ondelete CASCADE), description, suggestion,
  severity ('info'|'warning'|'error'), status ('candidate'|'open'|'rejected'),
  created_at, updated_at
  UNIQUE (workspace_id, review_type, entry_a_id, entry_b_id)
```

- `review_resolutions` 的 `finding_type` 增加 `duplicate`/`conflict`，`target_type` 增加 `ai_finding`（迁移 0008 重建约束）；处理闭环完全复用（解决/忽略/撤销/已处理列表）。
- `_finding_exists`/`_resolved_item` 增加 `ai_finding` 分支：校验发现存在、属当前 Workspace 且 status=open；已处理列表展示对偶记录摘要。

### 5. API 设计

- `POST /api/review/scans` body `{ scope_type, project_id?, node_id? }` → 校验范围归属后创建扫描并返回；空范围（无条目）也允许，扫描成功且 0 发现。
- `GET /api/review/scans/{scan_id}` → 扫描状态（供轮询）。
- `GET /api/review/scans/{scan_id}/candidates` → 该扫描的候选发现（含对偶记录证据）。
- `POST /api/review/findings/ai/{finding_id}/decision` body `{ decision: 'confirmed'|'rejected' }` → 幂等转换状态。
- `GET /api/review/findings` 待处理列表 = 数据驱动问题 ∪ status=open 的 AI 问题（均排除已处理）；已处理列表复用 resolutions（目标可为 ai_finding）。
- 范围校验：project 必须属当前 Workspace；node 必须属所选 project；跨 Workspace 按不存在处理。

### 6. AI Provider.review 实现

- DeepSeek / 豆包：构建审查 prompt（输出 JSON 数组：review_type / description / related_entry_ids / suggestion / severity），复用 `openai_compat` 的请求与结构校验思路，新增独立解析器；解析失败抛 `AIProviderError`（可重试）。
- Demo：返回空列表（扫描成功无发现；验收用测试桩或直插数据）。
- 未配置 AI：`get_ai_provider` 抛 `AIProviderNotConfiguredError` → 扫描失败并显示可读原因。

### 7. 前端

- 范围选择器：三个选项（全部工作区 / 指定项目 / 指定节点），项目与节点用级联下拉；选择结果按用户存 localStorage（`knowstruct.review.scope.<userId>`），进入页面自动恢复。
- "开始审查"按钮发起扫描并轮询（2s）；扫描中显示状态，失败显示原因并可重新开始。
- 候选发现区块：每条展示对偶记录、AI 说明、建议与严重度，操作"确认为问题"/"拒绝"。
- 待处理列表新增"疑似重复/疑似冲突"徽标；详情展示两条记录并跳转；解决/忽略/撤销沿用现有交互。
- 桌面与 390px 共用组件；范围选择在移动端同样可用。

## Risks / Trade-offs

- [AI 调用成本与延迟] → 范围选择 + 条目上限 + 批量调用控制；超限明确提示。
- [AI 误报/漏报] → 候选确认边界 + 严重度展示；拒绝可反悔。
- [同一对偶反复出现] → 去重键忽略非 rejected 的重复发现。
- [上下文长度超限] → 每批 ≤ 30 条并截断超长 content（沿用提取截断策略）。
- [worker 崩溃中断扫描] → 沿用 stale 恢复机制重置为 pending。

## Migration Plan

- Alembic 迁移 0008：建 `review_scans`、`review_ai_findings`，重建 `review_resolutions` 的两个 CHECK 约束（追加新枚举值）；MySQL 真实验证。
- 回滚：`alembic downgrade` 移除两表并还原约束；新接口 404 时前端隐藏扫描入口。

## Open Questions

- 无。范围选择（级联 + 记住上次）、上限策略、候选确认边界、两表模型与 worker 扩展均已与用户确认。
