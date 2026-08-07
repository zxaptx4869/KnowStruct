## 1. 后端

- [x] 1.1 新增 `ReviewResolution` 模型（finding_type、target_type、target_id、resolution、note，唯一约束与 Workspace 索引）与 Alembic 迁移 0007
- [x] 1.2 新增 `app/services/review.py`：`missing_source`/`missing_conditions`/`long_pending` 三类问题实时计算（排除已处理），以及 upsert / 撤销处理记录
- [x] 1.3 新增 `app/api/review.py` 与 schemas：`GET /api/review/findings`（类型与状态筛选）、`POST/DELETE /api/review/findings/{type}/{target_type}/{target_id}/resolution`
- [x] 1.4 pytest 覆盖：三类问题计算、排除已处理、空列表、处理/忽略/幂等/撤销、Workspace 隔离、已处理列表

## 2. 前端

- [x] 2.1 新增 `frontend/src/review/`（types、queries）与 `ReviewPage.tsx`：待处理/已处理 tab、类型筛选、卡片内联详情与跳转、解决/忽略（备注）、撤销
- [x] 2.2 注册 `/review` 路由，Layout 导航移除 P1 徽标；补充 `.review-*` 样式并适配 390px
- [x] 2.3 `ReviewPage.test.tsx` 覆盖：列表与筛选、详情展开与跳转、解决/忽略/撤销、空态、失败重试、localStorage 无依赖

## 3. 验证与同步

- [x] 3.1 后端全量验证：`cd backend && .venv/bin/pytest -q && .venv/bin/ruff check .`
- [x] 3.2 前端全量验证：`cd frontend && npm test -- --run && npm run lint && npm run build`
- [x] 3.3 浏览器验收：用种子数据在桌面与 390px 验证问题列表、筛选、详情跳转、解决/忽略/撤销与刷新持久化
- [x] 3.4 `openspec validate --all --strict` 通过
- [x] 3.5 同步主规格：新增 `openspec/specs/review/spec.md`
- [x] 3.6 归档 change 并提交，推送/合并前询问用户
