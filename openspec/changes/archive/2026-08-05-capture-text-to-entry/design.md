## Context

当前已实现：账号密码登录与个人 Workspace、项目 CRUD、普通多级知识目录（project-management / knowledge-directory 主规格）。`InboxPage` 仅是静态占位，没有采集 API；`backend/app/ai/` 只有抽象基类，没有 Provider 实现；`openai` SDK 已在依赖中；技术基线已移除 Redis；生产为多 worker uvicorn + MySQL RDS。

本切片把文字 / 链接采集做成完整垂直链路：Source 采集（可暂不选项目）→ MySQL 队列异步 AI 提取 → Extraction 候选 → 用户逐条确认 → 接受项生成正式 Entry 并保留来源关联。全部数据归属当前认证用户的默认 Workspace。

## Goals / Non-Goals

**Goals:**
- 文字 / 链接 Source 可快速采集，项目可选（未分配）；生成正式 Entry 前必须确认项目。
- AI 只生成待确认候选；候选可编辑、逐条接受 / 拒绝，接受才创建 Entry。
- 异步处理有状态（待处理 / 处理中 / 成功 / 失败）、时间线、从失败步骤重试且不复制 Source。
- 项目删除与节点子树删除的受保护引用检查落地（既有主规格要求）。
- 桌面（表格 + 并排确认）与移动（快速采集 + 一屏一条确认）同一响应式应用。

**Non-Goals:**
- 图片 / 截图上传与 OCR（下一切片 `upload-image-and-ocr`）；网页正文抓取（P1）。
- Entry 的常规新建 / 编辑 / 删除 UI、历史版本、批量操作（后续切片 / P1）。
- 搜索、Review、决策、预算；Redis / 外部队列；WebSocket / SSE 推送。

## Decisions

### 1. 数据模型：五个新表，全部带 `workspace_id` 归属

- `sources`：`workspace_id`（必填）、`project_id`（可空 = 未分配）、`source_type`（text / link，image 留待下一切片）、`title`（自动取内容首行）、`content`（文字原文或链接补充说明，作为可提取内容）、`link_url`（仅 link）、`content_status`（saving → saved；unavailable / pending_delete 仅建模，本切片无删除 UI）。内容状态与处理状态分离，处理状态由 Processing Task / Extraction 派生，不写入 Source。
- `processing_tasks`：与 Source 一对一（`source_id` 唯一索引）。`stage`（本切片固定 `ai_extraction`，后续切片扩展 upload / ocr）、`status`（pending / running / succeeded / failed）、`attempt_count`（≥1）、`last_error`、`claimed_at / started_at / finished_at`。单行状态机，重试是同一行 failed → pending（attempt +1，保留 Source），不存在孤儿任务行。
- `extractions`：`source_id`、`workspace_id`、`status`（pending_confirm / accepted / rejected）、`title / content / entry_type / applicable_conditions(JSON) / key_params(JSON) / risk_points(JSON) / suggested_node_path / confidence / decided_at`。候选只在 AI 步骤成功时随任务成功在同一事务创建；失败任务不产生候选，天然不重复。
- `entries`：`workspace_id`、`project_id`（NOT NULL，归档前必选）、`node_id`（可空 = 暂不归档）、`entry_type / title / content / status`（默认 archived，conflict 留待 Review P1）。
- `entry_sources`：`entry_id + source_id` 复合主键，保证正式记录来源追溯。

决策理由：按 Source / Task / Extraction / Entry 分层保存是产品不变量；`workspace_id` 冗余在每张业务表上，配合现有 `AuthContext.workspace` 做统一作用域查询，跨 Workspace 一律按不存在处理，不信任客户端传入的归属关系。

### 2. 采集与校验

- text：`content` 必填，strip 后 1..20000 字符；`title` 自动取首行（截断 100）。
- link：`link_url` 必填且为合法 http(s) URL（≤2048），`content`（补充说明）必填 1..2000 字符 —— 因为本切片不做网页抓取（P1），链接的可提取内容就是用户补充说明；无说明的裸链接无法进入确认链路，因此采集时必填，避免"空候选死循环"。
- 两端均支持可选 `project_id`（必须属于当前 Workspace），未传则未分配。
- 字段级校验错误返回 `422`，不落部分数据；前端保留输入。

### 3. MySQL 作为队列：乐观领取 + 进程内 worker

- 入队：创建 Source + ProcessingTask（pending）在同一事务提交。
- 领取：`UPDATE processing_tasks SET status='running', claimed_at=NOW() WHERE id=:id AND status='pending'`，rowcount=1 才领取成功。不依赖 `SKIP LOCKED`，SQLite 测试与 MySQL 多 worker 语义一致。
- 执行：FastAPI lifespan 启动一个 asyncio worker 循环，领取后调用 AI Provider；成功则同一事务写入候选并标记 succeeded，异常则标记 failed 并记录 `last_error`（保留 Source）。并发上限 1（P0 个人场景足够，避免 AI 超发）。
- 失效恢复：启动时及轮询中把 `running` 且 `claimed_at` 早于超时阈值（默认 10 分钟，配置化）的任务重置为 pending，容忍 worker 崩溃。
- 前端轮询：存在 pending / running 任务时，采集箱列表与详情每 3 秒刷新；全部终态后停止。

备选：Redis / Celery（技术基线明确移除 Redis）、`SELECT ... FOR UPDATE SKIP LOCKED`（MySQL 专用，SQLite 测试难覆盖）、请求内同步执行（AI 调用可能 30-90 秒，阻塞响应，且多 worker 下无队列语义）。

### 4. AI Provider：DeepSeek + 抽象扩展

- `app/ai/base.py` 增加抽象方法 `extract_candidates(content, content_type) -> list[ExtractionResult]`（一次多条候选，符合原型 2-4 条）；保留现有 `extract_info` 等签名不动。
- `app/ai/deepseek.py`：`AsyncOpenAI(api_key=..., base_url=DEEPSEEK_BASE_URL)`（OpenAI 兼容），模型 `DEEPSEEK_MODEL`（默认 `deepseek-chat`）；提示词要求输出严格 JSON 数组，经 Pydantic 校验（entry_type 枚举、confidence 0-1）；解析失败或空列表视为任务失败（"未生成有效候选"），可重试。
- `app/ai/__init__.py` 提供 `get_ai_provider()` 工厂，按 `AI_PROVIDER` 配置选择；未配置 API Key 时任务明确失败并提示"AI 服务未配置"。不在启动时校验 Key，避免本地开发无 Key 无法启动。
- 测试：FastAPI 依赖注入 FakeAIProvider（成功 / 空候选 / 抛错三种），单元测试覆盖 JSON 解析与校验。

### 5. 确认与 Entry 创建

- `POST /api/inbox/sources/{id}/extractions/{eid}/decide`：`decision=accepted|rejected`，可携带编辑字段（title / content / entry_type / applicable_conditions / suggested_node_path）与 `project_id`、`node_id`。
- accepted 必填 `project_id`（属于当前 Workspace）；`node_id` 若提供必须属于该项目（否则 409）。同一事务：更新 Extraction 状态 → 创建 Entry（status=archived）→ 写入 entry_sources。
- 幂等：已决定候选重复提交同一决定返回原结果，不重复创建 Entry（对应既有"重新提交确认不重复创建 Entry"）。
- `POST /api/inbox/sources/{id}/complete`：服务端校验全部候选已决定，未决定返回 409 及剩余数量；"完成本资料"不替代逐条决定。
- 全部候选被拒绝：Source 保留，任务 succeeded，界面显示"已处理 / 无正式记录"。

### 6. API 面（均为受保护端点，前缀 `/api/inbox`）

- `POST /sources`（201）：创建 Source + 任务。
- `GET /sources`：采集箱列表，支持 `state`（processing / failed / pending_confirm / done）、`source_type`、`project_id`、`q`（标题 / 内容 / URL 简单 LIKE）；按 created_at 倒序，P0 不分页、硬上限 200。
- `GET /sources/{id}`：Source + 任务时间线 + 候选列表。
- `POST /sources/{id}/retry`：仅 failed 可重试，重置 pending（attempt +1）。
- `POST /sources/{id}/extractions/{eid}/decide`、`POST /sources/{id}/complete`。

### 7. 既有删除保护钩子落地

- `count_project_content_references`：统计 `sources.project_id = project` 的已分配 Source + 全部 Entry，>0 时阻断删除（对应 project-management 主规格场景）。
- `count_protected_node_references`：统计 `entries.node_id` 落入被删子树的 Entry，>0 时阻断（对应 knowledge-directory 主规格场景）。

### 8. 桌面 / 移动同一响应式页面

- `/inbox`：采集表单（文字 / 链接 / 图片占位禁用）+ 处理队列。桌面为表格（原始来源 / 所属项目 / 处理状态 / 候选数 / 操作）+ 筛选；移动为模式切换 + 队列卡片 + 筛选 chips（待确认 / 处理中 / 失败 / 未分配）。
- `/inbox/:sourceId`：桌面左右分栏（来源预览 + 候选列表，确认进度，全部决定后"完成本资料"）；移动一屏一条候选（上一条 / 下一条 + 进度），来源顶部可展开预览。
- 项目页顶部新增"添加资料"按钮 → `/inbox?project=<id>` 预选项目（决定 4：一套采集箱、两个入口）。项目"资料 / 记录"双视图不在本切片。
- 复用既有设计 token、`state-panel` / 表格 / 卡片 / 弹窗模式，不做新一轮全局 UI 精修。

## Risks / Trade-offs

- [多 worker 并发处理同一任务] → 乐观领取 + 每 Source 单任务行，重复领取必有一方 rowcount=0。
- [worker 在处理中途崩溃] → 超时恢复把 stale running 重置 pending；候选只在成功事务中创建，重跑不会重复。
- [AI 输出非法 / 空候选] → 任务失败并给出可读原因，从失败步骤重试；空候选不当作成功。
- [AI 调用慢（30-90 秒）] → 异步 worker + 前端轮询；限制内容长度与并发 1 控制成本与超发。
- [SQLite 测试与 MySQL 行为差异] → 队列领取不用 MySQL 专有语法；JSON 列用 SQLAlchemy 通用 JSON，迁移用真实 MySQL 验证。
- [裸链接无法提取] → 采集时强制补充说明，P0 内可提取内容恒存在；网页抓取留给 P1。

## Migration Plan

- 新增 Alembic 迁移 `0003_capture_text_to_entry`：创建 sources、processing_tasks、extractions、entries、entry_sources 及索引 / 检查约束；随后部署后端（worker 随进程启动），前端静态部署即可。回滚为 `alembic downgrade` 删除五张表（预生产阶段无保留价值）。
- 迁移需在真实 MySQL 验证；测试用 SQLite 内存库 + `Base.metadata.create_all`。

## Open Questions

- 采集箱列表是否分页：P0 默认不分页（倒序 + 上限 200），后续切片按需加。
- 链接补充说明是否必填：本设计按必填处理（理由见决策 2），若产品希望允许裸链接暂存，需引入"待补充内容"状态，留作后续决策。
- Entry 创建后的常规编辑 / 删除：不在本切片，确认 UI 与 Entry 模型已为后续能力留出扩展位（node_id 可空、entry_sources 可多源）。
