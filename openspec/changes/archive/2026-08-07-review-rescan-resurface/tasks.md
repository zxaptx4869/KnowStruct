## 1. 实现与测试

- [x] 1.1 `review_scan.py` 去重分支：open 且带处理记录时删除处理记录使其重新浮现；candidate/open-未处理跳过；rejected 复活为候选
- [x] 1.2 pytest：已解决/忽略后重扫重新浮现（处理记录被清除、回到待处理）；已确认未处理重扫跳过；拒绝复活保持不变

## 2. 验证与同步

- [x] 2.1 后端全量验证：`cd backend && .venv/bin/pytest -q && .venv/bin/ruff check .`
- [x] 2.2 前端回归：`cd frontend && npm test -- --run && npm run lint && npm run build`
- [x] 2.3 `openspec validate --all --strict` 通过
- [x] 2.4 同步主规格：更新 `openspec/specs/review/spec.md`
- [x] 2.5 归档 change 并提交，推送/合并前询问用户
