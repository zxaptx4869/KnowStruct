## 1. 后端：批量确认端点与服务

- [x] 1.1 在 `backend/app/schemas/inbox.py` 新增 `BatchConfirmRequest`（source_ids、project_id、可选 node_id，沿用 1-100 条来源校验）与 `BatchConfirmResponse`（confirmed_sources、entries_created、skipped_low_confidence）
- [x] 1.2 在 `backend/app/services/confirmation.py` 新增批量确认服务：对全部选中 Source 加锁并按 Workspace 校验归属与 `pending_confirm` 状态
- [x] 1.3 实现可确认候选选择规则：`pending_confirm` 且 `confidence >= 0.7`（NULL 视为满足），低置信度候选保持待确认并计数
- [x] 1.4 实现批量事务：为每条可确认候选创建 Entry + EntrySource、标记 accepted、更新 Source 项目归属；任一失败回滚整批，返回可读冲突
- [x] 1.5 实现整批前置校验：项目必选且属于 Workspace、节点（若提供）属于所选项目、无任何可确认候选的 Source 整批拒绝、全部候选总数上限 200、重复提交返回冲突不重复创建
- [x] 1.6 在 `backend/app/api/inbox.py` 注册 `POST /sources/batch/confirm` 端点并接线服务与提交事务

## 2. 后端：自动化测试

- [x] 2.1 测试批量确认成功：多来源多候选生成对应 Entry、来源关联与项目归属更新
- [x] 2.2 测试低置信度候选被排除且计数正确、保持待确认
- [x] 2.3 测试整批拒绝：缺项目、节点不属于项目、含非待确认/跨 Workspace/无可确认候选的 Source、空请求、超过 100 来源、候选总数超 200
- [x] 2.4 测试原子回滚与幂等：任一候选创建失败不留部分 Entry；重复提交同批返回冲突不重复创建
- [x] 2.5 运行 `cd backend && .venv/bin/pytest -q && .venv/bin/ruff check .`

## 3. 前端：批量确认弹窗与交互

- [x] 3.1 在 `frontend/src/inbox/types.ts` 与 `queries.ts` 新增批量确认请求类型与 mutation
- [x] 3.2 在采集箱批量工具栏新增「批量确认」按钮（仅桌面端可见；选中项中存在待确认 Source 时可用）
- [x] 3.3 新增批量确认弹窗组件：打开时按选中来源分片并发拉取详情，展示来源级勾选（默认全选）与只读候选预览（标题、类型、置信度）
- [x] 3.4 弹窗规则：低置信度候选标灰标注「不纳入批量」；无可确认候选的来源禁用勾选并提示；弹窗内无候选级操作与跳转出口
- [x] 3.5 弹窗表单：项目必选、统一节点可选（默认暂不归档）；确认按钮实时显示「确认生成 N 条正式记录」
- [x] 3.6 提交与结果：失败保留全部状态可重试；成功关闭弹窗、toast 汇总（含跳过低置信度数）、刷新采集箱列表
- [x] 3.7 样式与响应式：弹窗在桌面与 390px 视口不溢出；移动端不显示批量确认入口

## 4. 前端：自动化测试

- [x] 4.1 组件测试：弹窗预览与来源级取消勾选、低置信度标记、无可确认来源禁用、项目必选、实时计数
- [x] 4.2 组件测试：提交失败保留状态、成功刷新与结果提示、移动端不显示批量入口
- [x] 4.3 运行 `cd frontend && npm test -- --run && npm run lint && npm run build`

## 5. 全量验证与归档

- [x] 5.1 运行 `openspec validate --all --strict`
- [x] 5.2 浏览器验收（参考 /private/tmp/ks-browser-check/ 的 playwright-core 模式）：桌面 1440 走通批量确认全流程，移动 390 确认无批量入口且采集箱正常
- [x] 5.3 同步主规格：将 delta spec 合并到 `openspec/specs/batch-confirm-candidates/spec.md`（含 Purpose 与主规格完整性检查）
- [x] 5.4 归档 change：运行 openspec archive 并核对归档产物
- [ ] 5.5 提交前向用户汇报并征得同意（推送/合并需用户确认）
