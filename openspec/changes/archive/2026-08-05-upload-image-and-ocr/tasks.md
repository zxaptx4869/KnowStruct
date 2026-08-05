## 1. 数据模型与迁移

- [x] 1.1 更新 Source 模型：source_type 增加 image，content 改为可空，新增附件列（object_key、filename、content_type、size）并更新表级 CHECK 约束
- [x] 1.2 更新 ProcessingTask.stage 增加 ocr 并更新 CHECK 约束
- [x] 1.3 新增 AiProviderConfig 模型（workspace_id 唯一、provider、api_key_encrypted、base_url、model、updated_at），归属 Workspace 并级联删除
- [x] 1.4 编写 alembic 迁移 0004（含 MySQL CHECK 约束 drop/add），验证 upgrade 与 downgrade
- [x] 1.5 更新模型导出与依赖（app/models/__init__.py 等）

## 2. 附件存储与图片上传 API

- [x] 2.1 新增 storage.py：AttachmentStorage 抽象 + LocalAttachmentStorage（目录、UUID 文件名、大小 / MIME 校验、清理残留），STORAGE_DIR 配置项并加入 .gitignore
- [x] 2.2 扩展 SourceCreate 与采集服务：multipart 图片上传（创建 Source → 保存附件 → content_status 状态流转），失败回滚 Source 并清理文件
- [x] 2.3 新增鉴权附件读取端点 GET /api/inbox/sources/{source_id}/attachment（Workspace 归属校验、私有缓存头）
- [x] 2.4 扩展响应模型：附件元数据（object_key 对外隐藏、filename、content_type、size、attachment_url），content 可空兼容

## 3. OCR 服务

- [x] 3.1 新增 DoubaoProvider（OpenAI 兼容、base_url 与模型可配置）：实现 ocr()（视觉请求 base64 图像）与 extract_candidates()（复用结构化提示词辅助函数）
- [x] 3.2 从 DeepSeek 提取公共 JSON 候选解析辅助，供 DeepSeek / 豆包共用
- [x] 3.3 新增 OCRRunner：配置 Provider → tesseract（检测二进制，可选）→ 失败可读原因；空文本按失败处理
- [x] 3.4 实现 DemoProvider.ocr() 确定性文本（含图片尺寸），用于本地验收
- [x] 3.5 补充依赖：cryptography、pytesseract（可选），更新 pyproject.toml

## 4. 任务流水线与重试

- [x] 4.1 新增 OCR 处理服务：OCR 成功写 source.content 并置 content_status=saved，同一任务接力置 stage=ai_extraction 并执行提取
- [x] 4.2 扩展 task_worker 按 task.stage 分派（ocr / ai_extraction），失败保留阶段并写可读 last_error
- [x] 4.3 复核 retry_source_task：从失败阶段重试、attempt_count 递增、附件不重传、候选 / Entry 不重复
- [x] 4.4 后端单测覆盖：OCR 成功 / 空文本 / 服务不可用 / 阶段重试 / 并发重试 / 跨 Workspace 隐藏

## 5. AI Provider 配置能力

- [x] 5.1 新增密钥加密工具：Fernet，密钥由 AI_CONFIG_ENCRYPTION_KEY 或 SECRET_KEY 派生；掩码工具（前 3 后 4，不足 8 位 ***）
- [x] 5.2 新增 /api/ai-config API：GET（掩码回显）、PUT（upsert，key 留空保留原值）、DELETE，全部 Workspace 归属校验
- [x] 5.3 改造 AI 工厂为 get_ai_provider(db, workspace_id)：用户配置优先、环境变量回退，未配置抛可读错误；移除或安全化全局缓存
- [x] 5.4 后端单测覆盖：加密存储 / 掩码回显 / 不泄露 key / 更新与删除 / 回退环境变量 / 跨 Workspace 404 / 未配置失败可读

## 6. 前端实现

- [x] 6.1 采集箱增加图片采集入口：移动端拍照（capture）与相册、桌面端文件选择；FormData 上传、提交中防重复、失败保留输入
- [x] 6.2 采集箱列表与详情支持 image Source：附件预览（鉴权 URL）、OCR 前"待识别"占位、处理阶段展示
- [x] 6.3 "我的"页新增"AI 服务配置"区块：provider 选择、API Key（掩码占位 / 留空不修改）、base_url / model 高级项、保存与删除，提示环境变量回退
- [x] 6.4 更新前端类型与测试（InboxPage、MePage），补充 390px 移动验收用例

## 7. 验证与真实验收

- [x] 7.1 后端全量：cd backend && .venv/bin/pytest -q && .venv/bin/ruff check .
- [x] 7.2 前端全量：cd frontend && npm test -- --run && npm run lint && npm run build
- [x] 7.3 openspec validate --all --strict
- [x] 7.4 MySQL 冒烟：迁移 upgrade/downgrade、图片上传 → demo OCR → 候选确认全链路（含失败重试）
- [x] 7.5 浏览器验收：桌面选文件上传、移动 390px 拍照 / 相册入口、预览与时间线、AI 配置保存 / 掩码 / 删除

## 8. 收尾

- [x] 8.1 按需读取并更新文档路由指向的详细文档（技术栈 AI Provider 部分、原型决策若受影响）
- [ ] 8.2 同步主规格（openspec sync）并校验
- [ ] 8.3 归档 change，提交分支并保留开发历史（如适用）
