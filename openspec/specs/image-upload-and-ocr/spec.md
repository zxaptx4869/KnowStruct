# image-upload-and-ocr Specification

## Purpose

图片 Source 采集（拍照 / 相册 / 选文件）、附件存储与鉴权预览、OCR 处理流水线与从失败步骤重试。

## Requirements

### Requirement: Image source upload with validated attachments

系统 SHALL 允许已认证用户在其当前 Workspace 内上传图片作为 Source。图片 Source 在 OCR 完成前正文可为空，附件 MUST 归属当前 Workspace 并持久化；单文件不得超过 10MB，MIME 必须为 image/jpeg、image/png 或 image/webp，宽高均不得超过 4096px。上传成功后才进入处理队列；上传失败 MUST 不留下 Source 或附件残片。

#### Scenario: Upload an image without a project
- **WHEN** 已认证用户提交合法图片且未选择项目
- **THEN** 系统在当前 Workspace 创建 image 类型 Source（内容为空、内容状态保存中），保存附件后置为已保存，创建 OCR 阶段任务并返回 Source 身份，项目归属为未分配

#### Scenario: Upload an image with a project
- **WHEN** 用户提交合法图片并选择当前 Workspace 内的项目
- **THEN** 系统创建归属于该项目的 image Source，其余行为与未分配采集一致

#### Scenario: Reject an invalid image upload
- **WHEN** 用户提交超过 10MB、MIME 不在白名单、宽高超过 4096px 或内容为空文件的图片
- **THEN** 系统拒绝请求并返回可定位到字段的验证错误，不创建 Source、不保存附件、不创建任务

#### Scenario: Reject an image for a project from another workspace
- **WHEN** 用户上传图片时选择其他 Workspace 的项目标识
- **THEN** 系统按项目不存在处理，拒绝创建 Source，不保存附件

#### Scenario: Fail to save the attachment without leaving residue
- **WHEN** 附件落盘失败（如磁盘错误或路径非法）
- **THEN** 系统回滚已创建的 Source 并清理已写入的文件，返回明确错误，不留下可访问的 Source 或附件

### Requirement: Authenticated attachment preview

系统 SHALL 提供经鉴权与 Workspace 归属校验的附件访问端点，供图片 Source 预览；未授权用户 MUST 按对象不存在处理，不得通过公开静态路径访问附件。

#### Scenario: Preview an owned attachment
- **WHEN** 已认证用户打开自己 Workspace 内 image Source 的附件端点
- **THEN** 系统返回原始图片内容与正确 Content-Type，响应标记为私有缓存

#### Scenario: Hide an attachment from another workspace
- **WHEN** 已认证用户使用其他 Workspace 的 image Source 标识请求附件
- **THEN** 系统按 Source 不存在处理，不返回文件内容

### Requirement: OCR processing pipeline with stepwise retry

系统 SHALL 为 image Source 建立 `ocr → ai_extraction` 的处理流水线：OCR 成功后将识别文本写入 Source 正文并标记内容已保存，随后在同一任务中进入 AI 提取；任一阶段失败 MUST 保留 Source 与已上传附件，任务记录失败阶段与原因，重试 MUST 从失败阶段继续且不重复上传、不复制 Source、候选或 Entry。

#### Scenario: OCR succeeds and text becomes extractable
- **WHEN** image Source 的 OCR 阶段执行成功并识别出非空文本
- **THEN** 系统将识别文本写入 Source 正文、内容状态置为已保存，任务进入 AI 提取阶段

#### Scenario: OCR returns empty text
- **WHEN** OCR 成功返回但文本为空或仅为空白
- **THEN** 系统将任务标记为失败并说明"未识别到文字"，Source 与附件保留且可重试

#### Scenario: OCR service is unavailable
- **WHEN** 配置的 OCR 服务不可用且本地兜底不可用（如未配置豆包且未安装 tesseract）
- **THEN** 系统将任务标记为失败并给出可读的"OCR 服务不可用"原因，Source 与附件保留且可重试

#### Scenario: Retry from the OCR stage without re-upload
- **WHEN** 用户对 OCR 阶段失败的任务执行重试
- **THEN** 系统将任务重置为待处理并保持 OCR 阶段，附件不再上传，OCR 重新执行并覆盖正文，成功后只进入一次 AI 提取

#### Scenario: Retry from the AI extraction stage without regenerating content
- **WHEN** 用户对 AI 提取阶段失败的任务执行重试
- **THEN** 系统从 AI 提取阶段重新执行，已识别的正文保留，成功后仅生成一次候选，不复制 Source 或附件

#### Scenario: Concurrent retries of the same failed task run once
- **WHEN** 同一失败任务被并发提交两次重试
- **THEN** 系统只允许一个任务进入执行，OCR 与候选生成不重复

### Requirement: Image capture entry points for mobile and desktop

系统 SHALL 在桌面与 390px 移动视口提供同一套图片采集入口：移动端提供拍照与相册选择，桌面端提供文件选择；上传中 MUST 阻止重复提交；明确失败 MUST 保留已选择的文件并允许重试。

#### Scenario: Capture an image from the mobile entry
- **WHEN** 移动用户在采集箱选择"拍照"或"从相册选择"并确认图片
- **THEN** 系统立即上传图片，成功后展示处理时间线，处理中可离开页面

#### Scenario: Capture an image from the desktop entry
- **WHEN** 桌面用户在采集箱选择"选择文件"并确认图片
- **THEN** 系统立即上传图片，成功后展示处理时间线，处理中可离开页面

#### Scenario: Prevent duplicate image upload
- **WHEN** 一个图片上传请求仍在处理中
- **THEN** 界面显示上传中状态并阻止重复提交

#### Scenario: Preserve image selection after a failed upload
- **WHEN** 图片上传明确失败（如校验错误或网络失败）
- **THEN** 界面保留已选择的文件与项目选择，显示可执行的错误提示，并允许修正后重试
