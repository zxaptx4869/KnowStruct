## Why

图片（截图、拍照、设计稿等）是当前最零散也最高频的经验来源，但采集箱目前只支持文字与链接。用户希望把图片直接丢进采集箱，由系统 OCR 转成文字后复用现有的 AI 候选提取与逐条确认流程，沉淀为正式记录；同时用户希望在自己的账号内配置 AI API Key（不限于 DeepSeek / 豆包），避免依赖部署环境变量才能使用 AI 提取。

## What Changes

- Source 增加 `image` 类型：支持上传图片附件、图片预览、OCR 后生成可提取正文；内容状态与处理状态继续分离保存。
- Processing Task 阶段扩展为 `upload → ocr → ai_extraction` 流水线：上传失败 / OCR 失败 / AI 提取失败均可从失败步骤重试，且不重复创建 Source、候选或 Entry。
- OCR 能力接入豆包视觉模型（火山方舟，OpenAI 兼容接口），tesseract 作为本地兜底，demo provider 提供可确定性验收的模拟 OCR。
- 新增 AI Provider 配置能力：用户可在"我的"页按 Workspace 配置 AI 提供商与 API Key（加密存储、掩码回显、可更新与删除）；运行时优先使用用户配置，未配置时回退到部署环境变量。
- 前端采集入口支持图片上传：移动端拍照 / 相册、桌面端选文件，上传后自动进入处理队列并展示处理时间线；确认页复用现有 `/inbox/:sourceId`（本切片不做确认 UI 增强）。
- 附件存储 P0 用本地目录 + FastAPI 静态服务，保留 OSS 抽象位，不强制接入 OSS。

## Capabilities

### New Capabilities
- `image-upload-and-ocr`: 图片 Source 采集、附件上传与预览、OCR 流水线、失败重试，以及图片 Source 的处理状态派生。
- `ai-provider-config`: 按 Workspace 配置 AI Provider 与 API Key，加密存储、掩码回显、更新 / 删除，以及运行时按用户配置解析 Provider。

### Modified Capabilities
- `inbox-processing`: 采集类型从文字 / 链接扩展为文字 / 链接 / 图片；处理状态机增加上传与 OCR 阶段及对应失败重试行为；采集入口增加图片上传。
- `extraction-confirmation`: AI Provider 的选择从"全局配置"调整为"当前用户配置优先、环境变量回退"；未配置 Provider 时的失败语义保持可读且可重试。

## Impact

- 后端：`Source`、`ProcessingTask` 模型与约束迁移（alembic 0004）；新增附件与 AI 配置相关模型；`inbox` 服务新增上传与 OCR 编排；`task_worker` 支持分阶段任务；AI 工厂改为请求级解析用户配置；新增 `storage` 服务与 `ocr` 服务；新增 `ai-config` API。
- 前端：采集箱图片上传入口（拍照 / 相册 / 选文件）、图片预览；"我的"页 AI Provider 配置表单；`inbox` 类型与 API 客户端扩展。
- 依赖：新增 `cryptography`（Fernet 加密）、可选 `pytesseract`（本地 OCR 兜底）；豆包视觉复用现有 `openai` SDK 与配置的 `base_url`。
- 验证：后端 pytest + ruff；OpenSpec 严格校验；SQLite 单测 + MySQL 冒烟；浏览器桌面与 390px 移动验收。
