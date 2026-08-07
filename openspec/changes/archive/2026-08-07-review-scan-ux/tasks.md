## 1. 后端

- [x] 1.1 新增 `GET /api/review/scans`（Workspace 隔离、按创建时间倒序、默认 10 条），`ReviewScanResponse` 补充 `started_at`
- [x] 1.2 `POST /api/review/scans` 增加并发保护：存在 pending/running 扫描时返回 409 `scan_in_progress`
- [x] 1.3 pytest：最近扫描列表、列表隔离、并发 409、started_at 返回

## 2. 前端

- [x] 2.1 新增 `ScopePicker` 树形选择器（桌面下拉 / 移动底部弹层），移除"全部工作区"与三连下拉；选择存 localStorage（兼容旧格式）
- [x] 2.2 Review 页挂载恢复最近扫描（`useRecentScans`），进行中继续轮询、完成展示结果与候选；按钮禁用依据服务端扫描状态
- [x] 2.3 扫描中面板显示开始时间与已用时；未选范围点击开始审查提示"请选择审查范围"
- [x] 2.4 测试更新与扩展：树选择/恢复/并发提示/未选范围提示/进度显示

## 3. 验证与同步

- [x] 3.1 后端全量验证：`cd backend && .venv/bin/pytest -q && .venv/bin/ruff check .`
- [x] 3.2 前端全量验证：`cd frontend && npm test -- --run && npm run lint && npm run build`
- [x] 3.3 浏览器验收：桌面与 390px——树选择、切页恢复扫描、进度显示、并发 409 提示
- [x] 3.4 `openspec validate --all --strict` 通过
- [x] 3.5 同步主规格：更新 `openspec/specs/review/spec.md`
- [x] 3.6 归档 change 并提交，推送/合并前询问用户
