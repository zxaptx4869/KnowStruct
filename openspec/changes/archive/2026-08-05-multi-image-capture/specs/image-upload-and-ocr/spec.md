## MODIFIED Requirements

### Requirement: Image source upload with validated attachments

系统 SHALL 允许已认证用户在其当前 Workspace 内一次上传 1-3 张图片作为一条 Source。每张图片 MUST 归属当前 Workspace 并持久化到附件子表；单张不得超过 10MB，MIME 必须为 image/jpeg、image/png 或 image/webp，宽高均不得超过 4096px，整批不超过 3 张。上传 MUST 原子执行：任一张校验失败则整批拒绝，不创建 Source、不保存任何附件。上传成功后才进入处理队列；落盘中途失败 MUST 清理已写文件，不留下 Source 或附件残片。

#### Scenario: Upload multiple images in one capture
- **WHEN** 已认证用户一次提交 3 张合法图片且未选择项目
- **THEN** 系统在当前 Workspace 创建一条 image 类型 Source，按提交顺序保存 3 张附件（内容状态从保存中转为已保存），创建 OCR 阶段任务并返回 Source 身份，项目归属为未分配

#### Scenario: Upload an image with a project
- **WHEN** 用户提交合法图片并选择当前 Workspace 内的项目
- **THEN** 系统创建归属于该项目的 image Source，其余行为与未分配采集一致

#### Scenario: Reject an invalid image in a batch
- **WHEN** 用户提交的图片中任一张超过 10MB、MIME 不在白名单、宽高超过 4096px、内容为空或无法解析，或整批超过 3 张
- **THEN** 系统拒绝整批请求并返回可定位到第几张的验证错误，不创建 Source、不保存任何附件、不创建任务

#### Scenario: Reject an image for a project from another workspace
- **WHEN** 用户上传图片时选择其他 Workspace 的项目标识
- **THEN** 系统按项目不存在处理，拒绝创建 Source，不保存附件

#### Scenario: Fail to save attachments without leaving residue
- **WHEN** 某张附件落盘失败（如磁盘错误或路径非法）
- **THEN** 系统回滚已创建的 Source 并清理已写入的文件，返回明确错误，不留下可访问的 Source 或附件

### Requirement: Authenticated attachment preview

系统 SHALL 提供经鉴权与 Workspace 归属校验的附件访问端点，供图片 Source 预览；未授权用户 MUST 按对象不存在处理，不得通过公开静态路径访问附件。多附件 Source 的每一张 MUST 可独立访问，并保留首图兼容端点。

#### Scenario: Preview an owned attachment
- **WHEN** 已认证用户打开自己 Workspace 内 image Source 的某张附件端点
- **THEN** 系统返回该张图片内容与正确 Content-Type，响应标记为私有缓存

#### Scenario: Preview the first attachment via the legacy endpoint
- **WHEN** 已认证用户使用旧的首图端点访问多附件 Source
- **THEN** 系统按排序返回第一张图片，不返回整批内容

#### Scenario: Hide an attachment from another workspace
- **WHEN** 已认证用户使用其他 Workspace 的 image Source 标识请求任一张附件
- **THEN** 系统按 Source 不存在处理，不返回文件内容

### Requirement: OCR processing pipeline with stepwise retry

系统 SHALL 为 image Source 建立 `ocr → ai_extraction` 的处理流水线：OCR 阶段按附件顺序逐张识别，识别文本按"图 N"标注合并写入 Source 正文并标记内容已保存，随后在同一任务中进入 AI 提取；任一张识别失败或返回空文本 MUST 整条失败并标注第几张，Source 与全部附件保留，重试 MUST 从 OCR 阶段重新识别整批，不重复上传、不复制 Source、候选或 Entry。

#### Scenario: OCR succeeds and text becomes extractable
- **WHEN** image Source 的全部附件 OCR 均成功并识别出非空文本
- **THEN** 系统按"图 1 / 图 2 / 图 3"顺序将识别文本合并写入 Source 正文、内容状态置为已保存，任务进入 AI 提取阶段

#### Scenario: OCR fails on one attachment
- **WHEN** 某一附件 OCR 返回空文本或服务不可用
- **THEN** 系统将任务标记为失败并说明失败的是第几张与原因，Source 与全部附件保留且可重试

#### Scenario: Retry from the OCR stage without re-upload
- **WHEN** 用户对 OCR 阶段失败的任务执行重试
- **THEN** 系统将任务重置为待处理并保持 OCR 阶段，附件不再上传，整批重新识别并覆盖正文，成功后只进入一次 AI 提取

#### Scenario: Retry from the AI extraction stage without regenerating content
- **WHEN** 用户对 AI 提取阶段失败的任务执行重试
- **THEN** 系统从 AI 提取阶段重新执行，已识别的正文保留，成功后仅生成一次候选，不复制 Source 或附件

#### Scenario: Concurrent retries of the same failed task run once
- **WHEN** 同一失败任务被并发提交两次重试
- **THEN** 系统只允许一个任务进入执行，OCR 与候选生成不重复

### Requirement: Image capture entry points for mobile and desktop

系统 SHALL 在桌面与 390px 移动视口提供同一套图片采集入口：移动端提供拍照与相册选择，桌面端提供文件选择；所选图片（最多 3 张）MUST 在客户端可预览、可逐张移除，并由用户点击"开始提取"后一次性提交；提交中 MUST 阻止重复提交；明确失败 MUST 保留已选择的文件与项目选择。

#### Scenario: Select multiple images then start extraction
- **WHEN** 用户在移动端从相册多选 3 张（或拍照逐张追加）后点击"开始提取"
- **THEN** 系统一次性上传整批，成功后跳转确认页展示处理时间线

#### Scenario: Remove one image before starting
- **WHEN** 用户已选择 2 张并移除其中 1 张
- **THEN** 待提交列表更新为 1 张，提交时只上传剩余图片

#### Scenario: Enforce the three-image limit
- **WHEN** 用户已选择 3 张并尝试再添加第 4 张
- **THEN** 界面阻止添加并提示已达上限，已选图片保持不变

#### Scenario: Prevent duplicate image upload
- **WHEN** 一个图片采集请求仍在提交中
- **THEN** 界面显示提交中状态并阻止重复提交

#### Scenario: Preserve image selection after a failed upload
- **WHEN** 图片采集明确失败（如校验错误或网络失败）
- **THEN** 界面保留已选择的文件与项目选择，显示可执行的错误提示，并允许修正后重试

## ADDED Requirements

### Requirement: Compressed inference copy before OCR

系统 MUST 在调用 AI OCR 前生成识别副本：最长边超过 2048px 的图片等比缩小，并按原格式以质量约 80 重编码；原图 MUST 原样保留用于预览与存档。识别结果与压缩副本不得互相污染，失败重试仍基于原图重新生成副本。

#### Scenario: Downscale a large image for OCR
- **WHEN** 上传图片的最长边超过 2048px 且进入 OCR 阶段
- **THEN** 系统以最长边 2048px 的压缩副本调用 OCR，原图文件保持不变

#### Scenario: Keep the original for preview
- **WHEN** 用户预览多附件 Source 的任一张图片
- **THEN** 系统返回原始图片内容（未经压缩降质）

#### Scenario: Regenerate the copy on retry
- **WHEN** OCR 失败后用户重试
- **THEN** 系统基于原图重新生成压缩副本并再次识别，不残留旧副本
