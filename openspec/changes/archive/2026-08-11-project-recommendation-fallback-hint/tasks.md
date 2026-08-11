## 1. 前端提示实现

- [x] 1.1 在 `frontend/src/pages/SourceConfirmPage.tsx` 归档项目下拉旁增加提示：
  当 `processing_state === 'done'`、`project_id` 为空、`recommended_project_id` 为空且
  工作区项目数大于 0 时，显示「AI 未能可靠判断归档项目，请手动选择」
- [x] 1.2 提示使用 `role="status"` 并复用 `recommend-banner` 样式；如样式不适配
  则补充最小 CSS，保持桌面与 390px 移动端不横向溢出

## 2. 自动化测试

- [x] 2.1 `SourceConfirmPage.test.tsx` 增加场景：Source 完成、未分配、无推荐且存在
  项目时显示提示
- [x] 2.2 增加场景：Source 已分配或有推荐结果时不显示该提示
- [x] 2.3 增加场景：工作区没有项目时不显示该提示
- [x] 2.4 增加场景：Source 仍在处理中时不显示该提示

## 3. 全量验证

- [x] 3.1 前端：`cd frontend && npm test -- --run && npm run lint && npm run build`
- [x] 3.2 后端回归：`cd backend && .venv/bin/pytest -q && .venv/bin/ruff check .`
- [x] 3.3 OpenSpec：`openspec validate --all --strict`
- [x] 3.4 浏览器验收（桌面 1440 + 移动 390，codex_acceptance 登录）：采集与任何
  项目主题无关的文字后，确认页项目下拉旁出现手动选择提示；已分配或推荐成功时不出现

## 4. 文档同步与归档

- [x] 4.1 将 delta spec 同步到 `openspec/specs/ai-archive-suggestion/spec.md`
- [x] 4.2 归档本 change（`openspec archive`），确认 `openspec validate --all --strict`
- [x] 4.3 提交到 `codex/project-recommendation-fallback-hint` 分支，不推送、不合并
