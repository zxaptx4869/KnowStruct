## 1. 共享 ScopePicker 抽取与泛化

- [x] 1.1 将 `frontend/src/review/ScopePicker.tsx` 迁移为 `frontend/src/components/ScopePicker.tsx`，值类型保持 `{ project_id?, node_id? }`
- [x] 1.2 增加 `placeholder` 与 `allowClear` 可选 props；`allowClear` 时面板顶部渲染「全部项目」行
- [x] 1.3 更新 `ReviewPage.tsx` import 路径并确认默认行为（请选择审查范围、无清除）不变
- [x] 1.4 删除旧 `review/ScopePicker.tsx`

## 2. 搜索页接入范围选择器

- [x] 2.1 `SearchPage.tsx` 以范围选择器替换「项目」「节点」两个下拉，范围值由 URL 派生
- [x] 2.2 范围变更映射到 `project`/`node` URL 参数（选项目清节点、选节点双设、全部项目清两者）
- [x] 2.3 保留类型筛选与「清除筛选」按钮，调整筛选条布局

## 3. 自动化测试

- [x] 3.1 更新 `SearchPage.test.tsx`：范围选择器选择项目/节点、展开节点、切换项目重置节点、回到全部项目、URL 参数与刷新恢复
- [x] 3.2 回归 `ReviewPage.test.tsx`，确认共享组件抽取后 Review 交互与文案不变
- [x] 3.3 运行 `cd frontend && npm test -- --run && npm run lint && npm run build` 全绿

## 4. 全量验证

- [x] 4.1 运行 `openspec validate --all --strict` 通过
- [x] 4.2 使用 demo 账号在桌面 1440 与移动 390 浏览器验收范围选择器（全部/项目/节点、切换重置、URL 刷新保持、错误恢复），并回归 Review 范围选择

## 5. 文档同步与归档

- [x] 5.1 将 delta spec 同步到 `openspec/specs/search-and-trace-source/spec.md`（MODIFIED「Search page filter interaction」）
- [x] 5.2 归档 `search-scope-picker`，提交分支（推送/合并前先经用户确认）
