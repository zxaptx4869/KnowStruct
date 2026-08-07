## 1. 后端模型与迁移

- [x] 1.1 新增 `ReviewScan`、`ReviewAiFinding` 模型与枚举扩展（FindingType 增加 duplicate/conflict、FindingTargetType 增加 ai_finding），注册到 models 包
- [x] 1.2 Alembic 迁移 0008：建 `review_scans`、`review_ai_findings`（含去重唯一约束），重建 `review_resolutions` 的 finding_type / target_type CHECK 约束

## 2. 后端扫描与 AI

- [x] 2.1 新增 `app/services/review_scan.py`：范围解析与校验、按同节点分组、批次上限与截断标记、扫描执行与失败落库
- [x] 2.2 `task_worker` 增加扫描领取/恢复/处理分支，复用进程内循环
- [x] 2.3 DeepSeek / 豆包实现 `review(entries)`（prompt + JSON 解析，失败抛可重试错误），Demo 返回空
- [x] 2.4 候选去重：`(workspace_id, review_type, entry_a_id, entry_b_id)` 忽略非 rejected 重复

## 3. 后端 API 与合并

- [x] 3.1 API：`POST /api/review/scans`、`GET /api/review/scans/{id}`、`GET /api/review/scans/{id}/candidates`、`POST /api/review/findings/ai/{id}/decision`
- [x] 3.2 findings 列表合并 status=open 的 AI 问题；`review_resolutions` 支持 ai_finding 目标（校验、已处理列表对偶摘要）
- [x] 3.3 pytest 覆盖：范围校验、扫描生命周期与失败、候选确认/拒绝/幂等/去重、列表合并、AI 问题处理与隔离、空范围

## 4. 前端

- [x] 4.1 范围选择器：全部/项目/节点级联下拉，localStorage 记住上次选择（按用户）
- [x] 4.2 开始审查、扫描轮询与失败重试；候选发现区块（对偶证据 + 确认/拒绝）
- [x] 4.3 AI 问题卡片（疑似重复/疑似冲突）、对偶详情与跳转、解决/忽略/撤销复用
- [x] 4.4 ReviewPage 测试扩展 + 390px 样式适配

## 5. 验证与同步

- [x] 5.1 后端全量验证：`cd backend && .venv/bin/pytest -q && .venv/bin/ruff check .`
- [x] 5.2 前端全量验证：`cd frontend && npm test -- --run && npm run lint && npm run build`
- [x] 5.3 浏览器验收：桌面与 390px——范围选择与记住上次、发起扫描与状态、候选确认/拒绝、AI 问题展示与处理
- [x] 5.4 `openspec validate --all --strict` 通过
- [x] 5.5 同步主规格：更新 `openspec/specs/review/spec.md`
- [x] 5.6 归档 change 并提交，推送/合并前询问用户
