## Why

Review 数据驱动检查已能发现缺来源、缺适用条件与长期待确认，但无法发现"内容本身"的问题：两条记录语义重复，或给出相反结论（如"零嵌冰箱底部散热" vs "两侧散热"）。本切片实现 AI 重复/冲突检测：用户在选定的范围（全部工作区 / 指定项目 / 指定节点）内手动触发扫描，AI 产出候选发现，逐条确认后进入 Review 待处理闭环。

## What Changes

- Review 页新增"开始审查"：手动触发异步扫描，范围选择器支持全部工作区 / 指定项目 / 指定节点（级联下拉），并在浏览器记住上次选择。
- 新增 `review_scans` 与 `review_ai_findings` 两张表（迁移 0008），复用进程内任务 worker 的领取/恢复/失败模式执行扫描。
- AI Provider 落地 `review(entries)`：DeepSeek / 豆包实现真实调用与 JSON 解析（输出 duplicate/conflict + 说明 + 建议 + 严重度），Demo 返回空。
- 扫描范围确定已归档 Entry 集合，按同节点分组批量交给 AI；单次扫描总条数设上限（100 条），超限在界面明确提示建议缩小范围。
- AI 发现一律为候选：用户逐条确认进入待处理、拒绝即丢弃；重复扫描对已存在且未拒绝的同配对发现去重。
- AI 问题（疑似重复/疑似冲突）在待处理列表与数据驱动问题并列，详情展示两条记录对比与 AI 说明，处理闭环（解决/忽略/撤销）复用现有 `review_resolutions`（target_type 扩展 `ai_finding`）。

## Capabilities

### New Capabilities

### Modified Capabilities
- `review`: 新增"AI 审查扫描"（范围选择、异步扫描与失败重试）、"AI 发现候选确认"（确认/拒绝与去重）、"AI 问题展示与处理"（对偶证据、跳转、解决/忽略/撤销）三类需求。

## Impact

- 后端：新增 `ReviewScan`、`ReviewAiFinding` 模型与迁移 0008（含 `review_resolutions` 约束扩展）；`task_worker` 增加扫描处理分支；`app/services/review_scan.py` 扫描与配对逻辑；DeepSeek / 豆包 `review` 实现；review API 增加扫描、轮询、候选确认接口；findings 列表合并 AI 问题。
- 前端：Review 页范围选择器（级联下拉 + localStorage 记住上次）、开始审查与轮询、候选发现区块（确认/拒绝）、AI 问题卡片与对偶详情；类型与查询扩展。
- 主规格：实现后更新 `openspec/specs/review/spec.md`。
- 依赖：`ai-provider-config`（Provider 解析）、`review`（处理闭环）、`password-authentication`（按用户隔离）。
