## Why

用户积累大量「待确认」资料时（如一次采集几十张截图），逐条打开确认页点「接受并生成正式记录」成本过高，成为采集整理闭环中最贵的人工步骤。本 Change 提供来源层的批量确认：用户勾选多条待确认 Source，一次性把其中高置信度候选归档为正式记录，低置信度候选仍保持待确认，事后可用单条编辑与 Review 兜底检查。

## What Changes

- 采集箱（桌面端）新增「批量确认」操作：勾选多条待确认 Source 后，弹窗展示只读候选预览（标题、类型、置信度）与来源级勾选，用户取消勾选来源即可将其排除。
- 批量确认只处理 `confidence >= 0.7` 的待确认候选；低置信度候选标灰、不纳入批量、保持待确认，并在弹窗中报告数量。
- 批量确认必须选择当前 Workspace 内的项目；统一归档节点可选，默认「暂不归档」。
- 为每条被确认候选创建正式 Entry 及其与原始 Source 的关联，候选标记 accepted，Source 归属更新到所选项目；全部在同一事务中完成，任一候选校验失败则整批拒绝，不产生部分成功。
- 批量请求沿用既有批量操作约束：单批最多 100 条 Source、总候选最多 200 条；跨 Workspace 标识按不存在处理；重复提交返回冲突，不重复创建 Entry。
- 移动端（390px）不提供批量确认，保持逐条确认流程。
- 不做批量拒绝（当前单条拒绝无撤销能力，批量拒绝不可逆风险过高）；弹窗内不提供候选级操作与跳转出口。

## Capabilities

### New Capabilities
- `batch-confirm-candidates`: 来源层批量确认候选并生成正式记录，含置信度门槛、来源级排除、整批原子、上限与 Workspace 隔离语义。

### Modified Capabilities

无。单条确认、采集箱既有批量操作（分配/删除/重试）的行为均不改变。

## Impact

- 后端：`backend/app/api/inbox.py` 新增批量确认端点；`backend/app/services/confirmation.py`（或 inbox 服务）新增批量确认服务逻辑；`backend/app/schemas/inbox.py` 新增请求/响应模型。复用现有 Extraction / Entry / EntrySource 模型与 Workspace 隔离模式，无数据库迁移。
- 前端：`frontend/src/pages/InboxPage.tsx` 批量工具栏新增「批量确认」与确认弹窗；`frontend/src/inbox/queries.ts`、`frontend/src/inbox/types.ts` 新增 mutation 与类型；样式跟随现有响应式设计。
- 测试：后端 pytest 覆盖正常、低置信度排除、整批拒绝、上限、跨 Workspace、幂等；前端组件测试覆盖弹窗交互与移动端隐藏；浏览器验收桌面 1440 与移动 390。
- 依赖的现有主规格：`extraction-confirmation`（Entry 创建与来源追溯语义）、`inbox-processing`（Source 状态派生与批量操作约定）。
- Appetite：小到中，单个垂直切片；不扩大数据模型，不改 AI 提取逻辑。
