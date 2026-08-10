## 1. 数据模型与迁移

- [x] 1.1 新增 `directory_draft_messages` 模型（draft_id、role、content、created_at）
- [x] 1.2 redraft 清空会话、discard 级联删除、确认后入口关闭且消息保留
- [x] 1.3 Alembic 迁移并在真实 MySQL 验证

## 2. AI 工具调用

- [x] 2.1 用真实 DeepSeek key 跑一次最小 function calling 连通性验证（豆包同验）
- [x] 2.2 在 `openai_compat.py` 增加带 `tools`/`tool_calls` 的 chat 助手与解析
- [x] 2.3 `apply_directory_tree` 工具协议：完整嵌套树 JSON，无 id
- [x] 2.4 `DemoProvider` 模拟工具调用（按指令返回整树或纯讨论），供本地验收与测试
- [x] 2.5 工具调用不可用时回退「约定标记块」解析兜底

## 3. 会话轮服务与 API

- [x] 3.1 上下文组装：system 约束提示 + 当前候选树快照 + 最近 10 轮完整 + 早期摘要
- [x] 3.2 会话轮逻辑：追加消息 → 调用模型 → 校验完整树 → 应用/反馈 → 有界自愈重试（≤2 次）
- [x] 3.3 历史压缩：超过 10 轮调用模型压缩为早期意图摘要，失败丢弃最早轮次；会话上限 30
- [x] 3.4 `POST /drafts/{id}/messages` 替换 `/refine`；消息与草稿响应返回
- [x] 3.5 `intent_note` 改为早期摘要载体，不再作为独立 UI 概念

## 4. 后端自动化测试

- [x] 4.1 纯讨论不改树；工具调用应用完整树并更新预览
- [x] 4.2 重名/超层反馈自愈一次成功；连续两次非法转人工且草稿可编辑
- [x] 4.3 每次调用注入最新树（含手动预览改动）；redraft 清空会话；历史压缩与 30 轮上限
- [x] 4.4 跨 Workspace 会话隔离、重复提交幂等、确认采用二次校验
- [x] 4.5 运行 `cd backend && .venv/bin/pytest -q && .venv/bin/ruff check .` 全绿

## 5. 前端会话 UI

- [x] 5.1 DraftPanel 改为「树 + 会话」双区：桌面左右、移动上下
- [x] 5.2 消息气泡（角色区分、「已更新目录」标记）、输入框发送与等待态、失败可重发
- [x] 5.3 移除旧「调整意见」输入框与 `/refine` 调用
- [x] 5.4 移动端 390px 树、消息区与输入框不横向溢出

## 6. 前端自动化测试

- [x] 6.1 会话发送、工具调用更新预览、讨论不改树、失败重发、移动端布局
- [x] 6.2 运行 `cd frontend && npm test -- --run && npm run lint && npm run build` 全绿

## 7. 全量验证与文档同步

- [x] 7.1 运行 `openspec validate --all --strict` 通过
- [x] 7.2 使用 demo + DeepSeek 在桌面 1440 与移动 390 验收会话全流程（讨论/应用/自愈/超限转人工）
- [x] 7.3 同步 delta spec 到 `openspec/specs/directory-draft/spec.md`
- [x] 7.4 归档 `directory-draft-chat` 并提交分支（推送/合并前先经用户确认）
