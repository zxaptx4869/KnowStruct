## 1. 数据库迁移

- [x] 1.1 生成 Alembic 迁移：`sources` 增加可空 `content_hash`、`link_hash`（VARCHAR(64)），`source_attachments` 增加可空 `file_hash`（VARCHAR(64)）
- [x] 1.2 为三列分别建立 `(workspace_id, hash)` 索引，并通过迁移升降级测试（MySQL `_test` 在最终验收环境验证）

## 2. 指纹计算

- [x] 2.1 实现 text 指纹：去除首尾空白、折叠连续空白后 SHA-256 全文
- [x] 2.2 实现 link 指纹：URL 规范化（scheme/host 小写、去首尾空白、去 fragment、保留查询参数）后 SHA-256
- [x] 2.3 实现 image 指纹：对上传文件原始字节逐文件 SHA-256，写入附件行
- [x] 2.4 在创建 text/link/image Source 时写入对应指纹，指纹异常静默降级不影响创建

## 3. 批量端点

- [x] 3.1 新增 `POST /api/inbox/sources/batch/assign`：原子校验（非空、≤100、归属当前 Workspace、未分配、无 Entry 引用、目标项目归属当前 Workspace），全部通过才提交
- [x] 3.2 新增 `POST /api/inbox/sources/batch/delete`：原子校验（无 Entry 引用、任务非运行中），事务删除 Source/任务/候选/附件行，提交后 best-effort 清理附件文件并记录失败日志
- [x] 3.3 新增 `POST /api/inbox/sources/batch/retry`：仅失败任务可重试，复用"从失败步骤重试、attempt_count+1、不复制内容"语义，同批事务提交
- [x] 3.4 三个端点统一返回可读错误与冲突信息（阻断数量等），空/超长/跨 Workspace 请求整批拒绝
- [x] 3.5 补充 `schemas/inbox.py` 的请求/响应模型

## 4. 疑似重复检测

- [x] 4.1 创建 Source 成功后按指纹查询 Workspace 内相同指纹历史 Source，响应携带 `duplicate_of`（原 Source id/标题/采集时间），不阻断创建
- [x] 4.2 列表查询对当前页 Source 指纹做批量 IN 查询，附加 `duplicate_of` 标记（image 按附件 `file_hash` 匹配）
- [x] 4.3 指纹计算或查询异常静默降级：创建成功无提示、列表不标记

## 5. 后端测试

- [x] 5.1 pytest 覆盖批量分配（正常/已分配/被引用/跨项目/空请求/超长）
- [x] 5.2 pytest 覆盖批量删除（正常含附件清理/被引用阻断含阻断数/运行中阻断/并发第二次按不存在处理）
- [x] 5.3 pytest 覆盖批量重试（仅失败/含非失败整批拒绝/不复制候选与 Entry）
- [x] 5.4 pytest 覆盖去重（重复链接/重复文字/空白差异/重复图片文件/fragment 忽略/查询参数保留/列表标记/异常降级/Workspace 隔离）
- [x] 5.5 运行 `cd backend && .venv/bin/pytest -q && .venv/bin/ruff check .` 全部通过

## 6. 前端

- [x] 6.1 采集箱列表增加复选框与表头全选（仅当前页），选中后显示批量操作条
- [x] 6.2 批量分配到项目（项目选择器）、批量删除（确认弹窗）、批量重试失败交互；操作失败保留选中项并显示可读错误，成功后清除选中并刷新
- [x] 6.3 桌面与移动列表项展示"疑似重复"徽标并可跳转原 Source
- [x] 6.4 采集提交（文字/链接/图片）成功后展示疑似重复提示，不阻断
- [x] 6.5 扩展 `frontend/src/inbox/` 查询与类型；`npm test -- --run && npm run lint && npm run build` 全部通过

## 7. 真实验收与规格同步

- [x] 7.1 使用浏览器验收（桌面 1440px + 390px 移动视口，参照 /private/tmp/ks-browser-check/ 模式）：批量分配/删除/重试、疑似重复标记与提示、空/失败状态
- [x] 7.2 `openspec validate --all --strict` 通过
- [x] 7.3 将 delta 规格同步进 `openspec/specs/inbox-processing/spec.md`，并按归档流程归档 Change、提交代码
