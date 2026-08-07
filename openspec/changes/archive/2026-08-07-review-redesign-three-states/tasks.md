## 1. 后端模型与迁移

- [x] 1.1 迁移 0010：`review_scans.skipped_rejected_count`；`review_ai_findings.status` 收敛为 open 并迁移旧 candidate/rejected（旧 rejected 补写 rejected 处理记录）；`review_resolutions.resolution` CHECK 增加 'rejected'
- [x] 1.2 模型：AiFindingStatus 仅 open、ResolutionType 增加 rejected、ReviewScan.skipped_rejected_count

## 2. 后端服务与 API

- [x] 2.1 `review.py`：移除 long_pending 计算；open 列表排除任何处理记录；已处理/已拒绝视图按 resolution 过滤；`set_resolution` 支持 rejected
- [x] 2.2 `review_scan.py`：发现直接创建 open；去重（无处理跳过/已解决清除并计数/已拒绝跳过并计数）；移除候选与决定逻辑
- [x] 2.3 API：删除 candidates/decision 接口；findings 支持 status=rejected；`GET /api/review/scans` 分页（limit/offset/total）+ scope_name + duration_seconds + decision_summary
- [x] 2.4 pytest 重写/扩展：直接进待处理、三态与撤销、拒绝跳过计数、重新浮现、移除 long_pending、分页与统计、数据驱动拒绝

## 3. 前端

- [x] 3.1 四 tab（待处理/已处理/已拒绝/审查记录）；待处理动作改为"标记已解决/拒绝"；已处理与已拒绝支持撤销/恢复
- [x] 3.2 移除候选区块、长期待确认筛选与决策接口调用；扫描结果文案（新问题/重新浮现/跳过已拒绝）
- [x] 3.3 审查记录：时间/耗时/范围/状态/结果/决策跟进/失败原因，分页加载更多，扫描完成刷新
- [x] 3.4 范围栏与扫描状态条紧凑化样式；测试更新与扩展

## 4. 验证与同步

- [x] 4.1 后端全量验证：`cd backend && .venv/bin/pytest -q && .venv/bin/ruff check .`
- [x] 4.2 前端全量验证：`cd frontend && npm test -- --run && npm run lint && npm run build`
- [x] 4.3 浏览器验收：桌面与 390px——直接进待处理、三态与撤销、拒绝跳过计数、审查记录分页、紧凑布局
- [x] 4.4 `openspec validate --all --strict` 通过
- [x] 4.5 同步主规格：更新 `openspec/specs/review/spec.md`
- [x] 4.6 归档 change 并提交，推送/合并前询问用户
