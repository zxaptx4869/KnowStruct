## Context

采集箱目前只支持文字 / 链接 Source，任务队列是单阶段 `ai_extraction`：创建 Source 即创建待处理任务，worker 乐观领取后直接调用 AI Provider 生成候选，失败保留 Source 并从失败步骤重试。AI Provider 工厂是全局 `lru_cache`，只读环境变量（`DEEPSEEK_API_KEY` 等），不支持按用户配置。确认页（逐条接受 / 拒绝、完成本资料）已交付，本切片直接复用。

本切片要补齐 P0 图片链路：图片采集 → OCR → AI 候选 → 复用确认页，并新增用户级 AI Provider / API Key 配置。

## Goals / Non-Goals

**Goals:**

- 图片 Source 可采集（移动端拍照 / 相册、桌面选文件）、预览、OCR 后进入 AI 提取。
- 任务队列支持 `ocr → ai_extraction` 两阶段，任一阶段失败都可从失败步骤重试，不复制 Source / 候选 / Entry。
- 豆包视觉（火山方舟，OpenAI 兼容）作为主 OCR，tesseract 本地兜底，demo 提供确定性验收。
- 用户可在"我的"页配置 AI Provider 与 API Key，加密存储、掩码回显、可更新 / 删除；运行时用户配置优先、环境变量回退。
- 附件 P0 落本地目录，通过鉴权端点访问；存储层抽象保留 OSS 接入位。

**Non-Goals:**

- 不做确认页 UI 增强（留给 `extract-and-confirm-entry` 切片）。
- 不接真实 OSS 上传（仅保留抽象与配置位）。
- 不引入图库多选、相册批量导入、图片裁剪 / 编辑、EXIF 处理等 P1+ 能力。
- 不做多账号协作 / 密钥共享 / 密钥轮换 UI。

## Decisions

### D1: 数据模型扩展（迁移 0004）

- `sources.source_type` CHECK 增加 `image`；`sources.content` 改为可空（OCR 完成前为空，列表与详情兼容显示"待识别"）。
- 附件列（仅 image Source 使用）：`attachment_object_key`（本地相对路径 / OSS key）、`attachment_filename`、`attachment_content_type`、`attachment_size`（字节）。
- `processing_tasks.stage` CHECK 增加 `ocr`；`ai_extraction` 保留。任务创建时 image Source 的 stage 为 `ocr`。
- 新增 `ai_provider_configs` 表：`workspace_id`（unique，FK workspace，级联删除）、`provider`、`api_key_encrypted`、`base_url`、`model`、`updated_at`。归属 Workspace，1:1。

理由：字段与约束在现有表上演进，避免新建平行表；`content` 可空是图片语义的自然结果（正文由 OCR 产生）。

### D2: 上传是同步的，OCR / AI 提取才入队

- `POST /api/inbox/sources` 扩展为同时接受 JSON（text / link）与 multipart（image + file + project_id 可选 + note 可选）。
- image 流程：先建 Source（占位标题、content 为空、`content_status=saving`）→ 本地保存附件 → 成功后 `content_status=saved` 并创建 stage=`ocr` 的任务 → 返回详情。文件保存失败时删除已建 Source 并回滚事务，前端保留选择可重新提交。
- 约束：单文件 ≤ 10MB，MIME 白名单 `image/jpeg` / `image/png` / `image/webp`，超过 4096px 的宽或高拒绝（避免大图与 OCR 成本）。

理由：上传失败是请求级错误，入队只会让状态机复杂化；OCR 与 AI 提取是异步可重试的，需要持久化任务。

### D3: 附件存储抽象 + 鉴权访问

- `storage.py` 定义 `AttachmentStorage` 接口（`save` / `open` / `delete`），P0 实现 `LocalAttachmentStorage`：目录 `{STORAGE_DIR}/{workspace_id}/{source_id}/`，文件名使用 UUID + 安全后缀；`STORAGE_DIR` 默认 `backend/data/attachments`（gitignore）。
- 读取走鉴权端点 `GET /api/inbox/sources/{source_id}/attachment`：校验 workspace 归属后返回 `FileResponse`（带 `Cache-Control: private`）。不挂公开静态目录，避免跨 Workspace 泄露。
- OSS 实现仅保留接口位：配置了 `OSS_*` 环境变量时按抽象接入，本切片不实现。

### D4: OCR 分层：豆包视觉 → tesseract → demo

- `AIProvider.ocr(image_data)` 抽象已存在。新增 `DoubaoProvider`（OpenAI 兼容 SDK，`base_url` 默认 `https://ark.cn-beijing.volces.com/api/v3`，默认视觉模型 `doubao-seed-2-0-lite-260428`，均可由用户配置覆盖）：`ocr()` 以 base64 `image_url` 发送视觉请求，prompt 要求"识别图片中的文字并原样输出"；`extract_candidates()` 复用 DeepSeek 的 JSON 结构化提示词（抽公共辅助函数）。
- `OCRRunner` 执行顺序：配置的 AI Provider `ocr()` → 若抛错或返回空且系统检测到 tesseract 二进制 → `pytesseract` 兜底 → 仍失败则任务失败并给出可读原因（"OCR 服务不可用"），可重试。
- `DemoProvider.ocr()` 返回确定性文本（包含固定演示句与图片尺寸），`AI_PROVIDER=demo` 时用于本地验收，不产生真实识别。
- tesseract 是可选依赖：`pytesseract` 加入依赖清单，二进制缺失时自动跳过并记录日志，不阻塞豆包路径。

### D5: 分阶段任务与从失败步骤重试

- worker 按 `task.stage` 分派：
  - `ocr`：OCR 成功 → 写 `source.content`、`content_status=saved` → 同一任务内接力置 `stage=ai_extraction` → 继续 `process_source_extraction`；任一环节失败 → 任务 `failed`，`last_error` 带失败步骤。
  - `ai_extraction`：现有逻辑（候选成功写入才标记 succeeded，失败保留 Source）。
- 重试入口复用 `retry_source_task`（failed → pending，attempt_count + 1）；worker 按失败时保留的 stage 从失败步骤继续：`ocr` 重试会重新识别并覆盖 content（不产生新候选），`ai_extraction` 重试直接重新提取（成功才写候选，天然不重复）。上传附件不需要重传。
- 乐观领取与 stale 恢复逻辑不变。

### D6: AI Provider 配置与解析

- 加密：`cryptography.Fernet`。密钥由 `AI_CONFIG_ENCRYPTION_KEY`（生产建议显式配置）或 `SECRET_KEY` 经 SHA-256 派生；API Key 只以密文入库。
- API（前缀 `/api/ai-config`，鉴权 + Workspace 归属）：
  - `GET` → `{provider, base_url, model, api_key_masked}`，掩码规则：保留前 3 位与后 4 位（`sk-***abcd`），不足 8 位显示 `***`；**任何响应、日志、异常消息都不含完整 key**。
  - `PUT` → 创建 / 更新（provider 必填，api_key 可选——缺省表示保留原 key；base_url / model 可选），成功回显掩码。
  - `DELETE` → 删除用户配置，之后回退环境变量。
- Provider 工厂改为 `get_ai_provider(db, workspace_id)`（移除全局 `lru_cache` 或仅对未配置场景缓存）：解析顺序 = Workspace 配置 → 环境变量 → 未配置错误。`AI_PROVIDER` 环境变量仍决定默认 provider 名称；用户配置的 provider 优先。
- 未配置时的失败语义与现状一致：任务失败，`last_error="AI 服务未配置：..."`，Source 保留可重试。

理由：Fernet 对称加密足够保护静态密钥；掩码 + 不回显保证泄露面最小；Workspace 1:1 表与现有数据归属规则一致。

### D7: 前端交互

- 采集箱（`InboxPage`）：采集入口增加"图片"方式——移动端提供"拍照"（`input capture="environment"`）与"从相册选择"两个入口，桌面端为"选择文件"；选中即上传（FormData multipart），成功显示处理时间线（复用现有状态展示），失败保留选择并提示。
- 详情（`/inbox/:sourceId`）：image Source 展示附件预览（鉴权 URL），OCR 前显示"待识别"，OCR 后展示正文与处理时间线。
- "我的"（`MePage`）：新增"AI 服务配置"区块——provider 下拉（DeepSeek / 豆包）、API Key 输入（已配置时显示掩码占位，留空表示不修改）、base_url / model 高级项、保存与删除；提示"未配置时使用部署环境变量"。
- 移动端与桌面端共用同一页面，仅上传入口按钮形态不同。

## Risks / Trade-offs

- [豆包模型名 / base_url 可能随服务调整] → 模型与 base_url 全部可配置（环境变量 + 用户配置），默认值集中在一处。
- [Fernet 密钥变更后旧密文不可解密] → 提供删除 / 重配路径；生产要求持久化 `AI_CONFIG_ENCRYPTION_KEY`，README 注明。
- [大图导致内存 / OCR 成本] → 10MB 与 4096px 上限，上传时校验。
- [tesseract 未安装导致兜底失效] → 检测二进制，缺失时跳过并给出可读错误；主路径是豆包视觉。
- [MySQL 修改 CHECK 约束与 nullable 的迁移风险] → Alembic 显式 drop / add CHECK，测试覆盖升级与回滚。
- [用户 key 写日志 / 异常] → 解析层统一脱敏，测试断言异常消息不含 key。

## Migration Plan

- `alembic upgrade head` 执行 0004：修改 `sources`（类型 CHECK、content nullable、附件列）、`processing_tasks`（stage CHECK）、新建 `ai_provider_configs`；downgrade 可完整回滚（image 数据删除由业务迁移处理或保留列）。
- 旧数据不受影响：text / link Source 的 content 保持非空，stage 保持 `ai_extraction`。
- 部署顺序：先升级后端（含迁移）再发布前端；附件目录需可写且被备份（OSS 接入后迁移存储位，本切片不处理）。

## Open Questions

- 无阻塞项。默认参数（豆包 base_url、模型、10MB / 4096px 限制、掩码规则）已在 D1-D7 中拍板，可在实现验收时按实际服务调整默认值。
