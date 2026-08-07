## Context

采集箱目前只有单条操作：创建（文字/链接/图片）、列表（按状态/类型/项目/关键词过滤）、详情、重试、候选确认、完成统计。Source 模型只有 `workspace_id`、可空 `project_id`、`source_type`、`title`、`content`、`link_url`、`content_status`，没有任何指纹字段；附件（`source_attachments`）也没有文件指纹。项目与节点的删除已采用"受保护引用检查 → 整批拒绝"模式（`ConflictError` + `blocker_count`），本 Change 复用该模式。

## Goals / Non-Goals

**Goals:**
- 桌面端支持多选 Source 的批量分配到项目、批量删除、批量重试失败任务。
- 采集提交与列表中提供"疑似重复采集"提示（同一链接/同一段文字/同一文件字节），不阻断、不自动处理。
- 所有批量操作保持原子性：任一前置条件不满足则整批拒绝，不产生部分成功。
- 维持正式知识可追溯不变量：被 Entry 引用的 Source 不可删除、不可改分配。

**Non-Goals:**
- 记录（Entry）级批量操作、标签/结构化字段、搜索组合筛选、修改历史。
- 候选级批量确认（E14）。
- 模糊去重（感知哈希、语义相似）；只做精确指纹。
- 自动合并或自动删除重复来源。
- 移动端批量操作（移动端仅展示疑似重复标记）。

## Decisions

### 1. 指纹存储位置与算法
- `sources` 新增 `content_hash`（text）、`link_hash`（link），各 64 字符 SHA-256 十六进制；`source_attachments` 新增 `file_hash`（image 逐文件）。
- text：去除首尾空白、折叠连续空白后对全文做 SHA-256。
- link：`urlsplit` 规范化（scheme/host 小写、去首尾空白、去 fragment），**保留查询参数**；再做 SHA-256。
- image：对上传文件原始字节做 SHA-256，逐张写入附件行。
- 备选：单一 `fingerprint` 列 + 类型列。否决理由：三种类型的查询维度不同（附件按文件、Source 按内容/链接），分列更直接，索引也更精确。

### 2. 批量端点（均为原子）
- `POST /api/inbox/sources/batch/assign`（body: `source_ids`, `project_id`）
- `POST /api/inbox/sources/batch/delete`（body: `source_ids`）
- `POST /api/inbox/sources/batch/retry`（body: `source_ids`）
- 前置校验顺序：非空且 ≤100 条 → 全部存在且属于当前 Workspace → 按操作检查状态/引用 → 任一不满足整批拒绝。
- 批量删除的附件文件清理放在事务提交后 best-effort 执行；文件删除失败仅记录日志，不阻断（孤儿文件可后续清理，不在本 Change 范围）。
- 备选：逐条跳过并返回汇总。否决理由：与现有项目/节点删除模式不一致，且"部分成功"会让用户难以判断；整批拒绝信息更明确。

### 3. 分配与删除约束
- 分配：仅 `project_id IS NULL` 且无 `entry_sources` 引用的 Source 可分配；目标项目必须属于当前 Workspace。已分配或被引用 → 整批拒绝。
- 删除：有 Entry 引用、或任务处于 `running` 的 Source 拒绝删除；`pending`/`failed`/`succeeded` 可删（运行中任务删除会让 worker 处理已消失对象，直接拒绝最安全）。
- 重试：仅 `failed` 任务；复用现有 `retry_source_task` 的"保留失败阶段、attempt_count+1、不复制任何内容"语义，逐条执行但同批事务提交。

### 4. 疑似重复提示
- 创建 Source 成功后计算指纹并查询 Workspace 内同指纹历史 Source；命中则把原 Source id 持久化到 `sources.duplicate_of_id`（FK，原 Source 删除时 SET NULL），创建响应携带 `duplicate_of`（原 Source id、标题、采集时间），不阻断创建。
- 列表与详情直接按存储的 `duplicate_of_id` 解析原 Source，创建提示与列表标记天然一致，不受同秒时间戳排序影响。
- 指纹计算或查询异常时静默降级：创建成功但无提示，列表不标记。
- 备选：列表每次按指纹实时重算"最早来源"。否决理由：`created_at` 为秒级精度，同秒内靠随机 UUID 排序不稳定，会导致创建提示与列表标记不一致。
- 备选：采集时直接拒绝重复提交。否决理由：用户可能有意重复采集（不同项目/不同用途），提示比阻断更符合"AI 候选、人工决策"的产品边界。

### 5. 前端交互
- 桌面端采集箱列表增加复选框（表头全选，仅当前页）；选中后出现批量操作条：分配到项目（项目选择器）、删除（确认弹窗）、重试失败。
- 批量操作失败保留选中项并显示可读错误；成功后清除选中并刷新列表。
- 移动端（390px）不提供批量操作条；列表项展示"疑似重复"徽标并可跳转原 Source。

## Risks / Trade-offs

- [并发批量删除与候选确认竞争] → 以行级锁/事务隔离处理；第二方操作到已删除 Source 时按不存在处理，返回冲突且不产生副作用。
- [附件文件清理失败留下孤儿文件] → 记录日志并在设计文档中标注后续清理任务（本 Change 不做）。
- [指纹归一化规则产生漏报/误报] → 只做精确指纹，宁可漏报不误报；规则在规格中固定，后续可扩展。
- [列表去重查询增加开销] → 指纹列加 `(workspace_id, hash)` 索引；列表一次性批量查询，不逐条查。
- [批量操作条在超长列表上的分页限制] → 选择仅限当前页，规格中明确，避免跨页状态复杂化。

## Migration Plan

- 生成 1 个 Alembic 迁移：`sources` 增加 `content_hash`、`link_hash`（可空，VARCHAR(64)），`source_attachments` 增加 `file_hash`（可空，VARCHAR(64)），并建索引 `(workspace_id, content_hash)`、`(workspace_id, link_hash)`、`(workspace_id, file_hash)`。
- 存量数据不回溯填充指纹（历史重复只影响新采集/新列表提示），迁移可空列即可。
- 回滚：反向迁移删除列；前端与新端点随后端一起发布。

## Open Questions

- 批量上限 100 是否合适（可调，规格中先固定）。
- 列表"疑似重复"是否需要对已生成 Entry 的 Source 也标记（建议标记但不提供删除），无阻塞性分歧。
