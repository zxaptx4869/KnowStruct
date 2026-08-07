## 1. 后端

- [x] 1.1 迁移 0009：`review_scans.resurfaced_count`（INTEGER NOT NULL DEFAULT 0）；模型与 `ReviewScanResponse` 补充字段
- [x] 1.2 `run_scan` 写入重新浮现计数；pytest 断言 resurfaced_count（重扫覆盖/不覆盖范围）

## 2. 前端

- [x] 2.1 扫描状态跃迁到 succeeded 时 invalidate findings 查询（ref 守卫，避免循环）；无需刷新即可看到重新浮现问题
- [x] 2.2 完成文案区分"新候选 N 条"与"已处理问题已重新浮现 M 条"；测试更新

## 3. 验证与同步

- [x] 3.1 后端全量验证：`cd backend && .venv/bin/pytest -q && .venv/bin/ruff check .`
- [x] 3.2 前端全量验证：`cd frontend && npm test -- --run && npm run lint && npm run build`
- [x] 3.3 浏览器验收：扫描完成后无需刷新即看到重新浮现问题 + 文案区分
- [x] 3.4 `openspec validate --all --strict` 通过
- [x] 3.5 同步主规格：更新 `openspec/specs/review/spec.md`
- [x] 3.6 归档 change 并提交，推送/合并前询问用户
