# inbox-processing Specification

## Purpose
TBD - created by archiving change capture-text-to-entry. Update Purpose after archive.
## Requirements
### Requirement: Workspace-scoped text and link source capture

系统 SHALL 允许已认证用户在其当前默认 Workspace 内采集文字和链接 Source。采集时项目可选：未选择项目时 Source 保存为"未分配"，客户端 MUST NOT 自行指定 Workspace 归属。文字 Source SHALL 包含自动生成的标题与正文内容；链接 Source SHALL 包含合法 http(s) 链接与用户补充说明（作为本切片可提取内容，网页正文抓取不在 P0 范围）。

#### Scenario: Capture text without a project
- **WHEN** 已认证用户在采集箱提交去除首尾空白后非空的文字内容且未选择项目
- **THEN** 系统在当前 Workspace 创建标题自动取自内容首行的 Source，项目归属为未分配，并创建待处理的 Processing Task，返回 Source 身份

#### Scenario: Capture text with a project
- **WHEN** 用户提交文字内容并选择当前 Workspace 内的项目
- **THEN** 系统创建归属于该项目的 Source，其余行为与未分配采集一致

#### Scenario: Reject invalid text input
- **WHEN** 用户提交空白、超过 20000 字符的文字内容
- **THEN** 系统拒绝请求并返回可定位到字段的验证错误，不写入任何 Source 或任务数据

#### Scenario: Capture a link with a note
- **WHEN** 用户提交合法 http(s) 链接及非空补充说明，且可选选择项目
- **THEN** 系统创建 link 类型 Source，保存链接、补充说明与项目归属，并创建待处理任务

#### Scenario: Reject an invalid link input
- **WHEN** 用户提交非法链接、缺失补充说明或超过 2000 字符的补充说明
- **THEN** 系统拒绝请求并返回可定位到字段的验证错误，不写入部分数据

#### Scenario: Reject a project from another workspace
- **WHEN** 用户采集时选择其他 Workspace 的项目标识
- **THEN** 系统按项目不存在处理，拒绝创建 Source，不修改任何项目数据

### Requirement: Derived inbox queue states

系统 SHALL 在采集箱列表与详情中提供由 Processing Task 和 Extraction 派生的处理状态：处理中（待处理 / 执行中）、失败、待确认、已处理（全部候选已决定）。Source 自身的内容状态 MUST 与处理状态分离保存；列表 MUST 同时返回待确认、已接受、已拒绝候选数量，不得伪造未实现的数据。图片 Source 在 OCR 完成前正文为空，处理中状态 MUST 展示当前阶段（OCR / AI 提取），内容状态与处理状态分别展示。

#### Scenario: Show an empty inbox
- **WHEN** 当前 Workspace 没有任何 Source
- **THEN** 采集箱返回空列表，界面显示空状态说明，不显示伪造的处理状态或候选数量

#### Scenario: Show a processing source
- **WHEN** Source 存在待处理或执行中的 Processing Task
- **THEN** 采集箱显示该 Source 为处理中并展示当前处理步骤，用户可离开页面

#### Scenario: Show a failed source
- **WHEN** Source 的 Processing Task 处理失败
- **THEN** 采集箱显示失败状态、失败步骤与原因，并提供从失败步骤重试的操作，原始 Source 保持不变

#### Scenario: Show a pending-confirmation source
- **WHEN** Source 处理成功且存在至少一条待确认候选
- **THEN** 采集箱显示"待确认"状态与候选数量，可进入确认

#### Scenario: Show a processed source
- **WHEN** Source 处理成功且全部候选已有接受或拒绝决定
- **THEN** 采集箱显示"已处理"状态与接受 / 拒绝数量，不显示待确认候选

#### Scenario: Read a source detail
- **WHEN** 用户打开某个 Source
- **THEN** 系统返回原始内容或链接与说明预览、任务时间线（状态、步骤、尝试次数、错误信息）和候选列表

#### Scenario: Show an image source before OCR
- **WHEN** 用户打开正文为空且仍处于 OCR 阶段的 image Source
- **THEN** 详情显示附件预览、内容"待识别"占位与当前处理步骤，不显示伪造正文

#### Scenario: Show an image source after OCR
- **WHEN** 用户打开已完成 OCR 的 image Source
- **THEN** 详情显示识别后的正文、内容已保存状态与后续处理步骤

#### Scenario: Hide a source from another workspace
- **WHEN** 已认证用户使用其他 Workspace 的 Source 标识访问列表或详情
- **THEN** 系统按 Source 不存在处理，不暴露标识是否真实存在，也不修改任何数据

### Requirement: Failure-safe processing and retry from the failed step

系统 MUST 将 Processing Task 持久化在 MySQL 中，状态为待处理 / 处理中 / 处理成功 / 处理失败。任务阶段覆盖上传、OCR 与 AI 提取：上传在采集请求内同步完成，OCR 与 AI 提取作为异步任务阶段执行。任务失败时 MUST 保留原始 Source 与已上传附件；重试 MUST 从失败阶段重新进入队列，且不得复制 Source、附件、已生成的候选或 Entry。

#### Scenario: Retry a failed task without duplicating the source
- **WHEN** 用户对处理失败的 Source 执行重试
- **THEN** 系统将该 Source 的任务重置为待处理并增加尝试次数，不创建新的 Source，成功后只生成一次候选

#### Scenario: Retry an OCR-stage failure without re-uploading
- **WHEN** 用户对 OCR 阶段失败的 image Source 执行重试
- **THEN** 系统将任务重置为待处理并保持 OCR 阶段，已上传附件原样保留，OCR 重新执行

#### Scenario: Retry an AI-extraction-stage failure without regenerating content
- **WHEN** 用户对 AI 提取阶段失败的 Source 执行重试
- **THEN** 系统从 AI 提取阶段重新执行，已保存的正文或内容原样保留，成功后仅生成一次候选

#### Scenario: Reject retry of a non-failed task
- **WHEN** 用户对仍在处理中、待确认或已处理的 Source 执行重试
- **THEN** 系统拒绝重试操作并返回冲突，Source 与任务状态保持不变

#### Scenario: Concurrent retries do not run twice
- **WHEN** 同一失败任务被并发提交两次重试
- **THEN** 系统只允许一个任务进入执行，候选与 Entry 不重复

### Requirement: Responsive capture entry points

系统 SHALL 在桌面和 390px 移动视口提供同一套采集能力：全局"采集"入口支持文字、链接与图片采集；项目内"添加资料"入口复用同一采集箱并预选该项目。三种方式的提交动作统一为"开始提取"：文字 / 链接提交即入队，图片在客户端选齐（最多 3 张、可移除）后由用户点击"开始提取"一次性提交；提交中 MUST 阻止重复提交；明确失败 MUST 保留用户输入与已选图片。

#### Scenario: Capture from the global entry
- **WHEN** 桌面或移动用户从全局导航进入采集箱并提交文字、链接或图片
- **THEN** 界面保存成功后展示处理时间线，处理中可离开页面

#### Scenario: Capture with a preselected project
- **WHEN** 用户从项目页的"添加资料"入口进入采集箱
- **THEN** 采集表单预选该项目，提交后 Source 归属于该项目，且不出现第二套采集数据

#### Scenario: Start extraction for text or link
- **WHEN** 用户填写文字或链接后点击"开始提取"
- **THEN** 系统保存 Source 并立即入队处理，按钮文案与行为与其他采集方式一致

#### Scenario: Start extraction for a multi-image capture
- **WHEN** 用户已选择 1-3 张图片后点击"开始提取"
- **THEN** 系统一次性上传整批并创建 OCR 阶段任务，成功后展示处理时间线

#### Scenario: Prevent duplicate capture submission
- **WHEN** 一个采集请求仍在处理中
- **THEN** 界面显示提交中状态并阻止重复提交

#### Scenario: Preserve capture input after a known failure
- **WHEN** 采集请求明确失败（如校验错误或网络失败）
- **THEN** 界面保留已输入的内容、链接、图片文件与项目选择，显示可执行的错误提示，并允许修正后重试

### Requirement: Source detail shows related formal entries

系统 SHALL 在 Source 详情响应中返回该来源关联的已归档正式 Entry（类型、标题、项目与节点、创建时间）。前端 SHALL 展示"关联正式记录"区块，并允许跳转到对应节点详情（未归档节点时跳转到项目页）。

#### Scenario: Return related entries in source detail
- **WHEN** 用户打开一个已产生正式记录的 Source 详情
- **THEN** 响应包含该来源关联的已归档记录，按创建时间倒序

#### Scenario: Jump from a related entry to its node
- **WHEN** 用户点击来源详情中的某条关联记录
- **THEN** 跳转到该记录所属节点详情；未归档到节点时跳转到所属项目页

#### Scenario: Hide another workspace's related entries
- **WHEN** Source 或关联记录属于其他 Workspace
- **THEN** 系统不返回跨 Workspace 数据，按不存在处理

#### Scenario: Hide the section without related entries
- **WHEN** Source 尚未产生任何正式记录
- **THEN** 详情响应返回空列表，前端不展示伪造的关联记录

### Requirement: Batch organize sources

系统 SHALL 允许已认证用户对其 Workspace 内的多条 Source 执行批量分配到项目、批量删除与批量重试。批量请求 MUST 为原子操作：任一 Source 标识不存在、属于其他 Workspace、或状态不满足操作前置条件时，MUST 整批拒绝，不产生部分成功；空请求或超过 100 条的请求 MUST 被拒绝。批量分配 MUST 仅允许 `project_id` 为空且未被任何正式 Entry 引用的 Source，目标项目 MUST 属于当前 Workspace，分配后 Source 归属该项目。批量删除 MUST 拒绝被任何正式 Entry 引用、或 Processing Task 处于执行中的 Source，删除 MUST 同时移除数据库记录并清理已上传附件文件。批量重试 MUST 仅对 Processing Task 处于失败状态的 Source 生效，并沿用"从失败步骤重试、不复制 Source/附件/候选/Entry"的既有语义。

#### Scenario: Assign unassigned sources to a project
- **WHEN** 用户批量分配 2 条未分配且无正式记录引用的 Source 到当前 Workspace 的某项目
- **THEN** 两条 Source 一次性归属该项目，列表与详情中的项目归属随之更新

#### Scenario: Reject assigning an already-assigned source
- **WHEN** 批量分配请求中某条 Source 已归属于其他项目
- **THEN** 系统整批拒绝分配，返回可读冲突，所有 Source 归属保持不变

#### Scenario: Reject assigning a source referenced by an entry
- **WHEN** 批量分配请求中某条 Source 已被正式 Entry 引用
- **THEN** 系统整批拒绝分配，保持所有 Source 归属不变，不破坏既有追溯关系

#### Scenario: Reject assigning to a foreign project
- **WHEN** 批量分配的目标项目属于其他 Workspace
- **THEN** 系统按项目不存在处理，整批拒绝且不暴露项目是否真实存在

#### Scenario: Delete unreferenced sources with attachments
- **WHEN** 用户批量删除 3 条无正式记录引用且任务非运行中的 Source（含图片附件）
- **THEN** 系统在单个事务中删除 Source 及其任务、候选与附件记录，并清理已上传的附件文件

#### Scenario: Block deletion of a referenced source
- **WHEN** 批量删除请求中某条 Source 已被正式 Entry 引用
- **THEN** 系统整批拒绝删除并返回阻断数量与原因，Source、Entry 与引用关系保持不变

#### Scenario: Block deletion while a task is running
- **WHEN** 批量删除请求中某条 Source 的 Processing Task 正在执行
- **THEN** 系统整批拒绝删除，Source 与任务状态保持不变

#### Scenario: Retry only failed sources
- **WHEN** 用户批量重试 2 条失败任务 Source
- **THEN** 两条任务重置为待处理并从失败步骤重新执行，尝试次数增加，不复制 Source、附件、候选或 Entry

#### Scenario: Reject a batch containing a non-failed source
- **WHEN** 批量重试请求中某条 Source 的任务处于处理中、待确认或已处理状态
- **THEN** 系统整批拒绝重试，所有任务状态保持不变

#### Scenario: Reject empty, oversized, or foreign batches
- **WHEN** 批量请求为空、超过 100 条、或包含其他 Workspace 的 Source 标识
- **THEN** 系统整批拒绝并返回可读错误，不修改任何数据，也不暴露标识是否存在

### Requirement: Suspected duplicate capture detection

系统 SHALL 为 Workspace 内的 Source 计算去重指纹：text 对去除首尾空白并折叠连续空白后的全文计算 SHA-256；link 对规范化 URL（scheme 与 host 转小写、去除首尾空白、去除 fragment，保留查询参数）计算 SHA-256；image 对每个附件文件原始字节计算 SHA-256。采集提交成功时，系统 MUST 返回该 Source 是否命中当前 Workspace 内已有相同指纹的 Source（含原 Source 标题与采集时间）；命中 MUST NOT 阻断创建。采集箱列表 MUST 为命中指纹的 Source 标记"疑似重复采集"并指向原 Source。指纹计算或查询失败 MUST 静默降级，不影响采集与列表展示。

#### Scenario: Hint on duplicate link capture
- **WHEN** 用户采集一条链接，其规范化 URL 与 Workspace 内已有 Source 相同
- **THEN** 新 Source 创建成功，响应携带疑似重复提示与原 Source 的标题与采集时间

#### Scenario: Hint on duplicate text capture
- **WHEN** 用户采集一段文字，其归一化全文与 Workspace 内已有 Source 相同
- **THEN** 新 Source 创建成功并提示疑似重复，不阻断采集

#### Scenario: Hint on duplicate image file
- **WHEN** 用户上传一张图片，其文件字节与 Workspace 内已有附件完全相同
- **THEN** 新 Source 创建成功并提示疑似重复，附件正常保存

#### Scenario: Treat whitespace differences in text as duplicates
- **WHEN** 两段文字仅空白数量或换行位置不同
- **THEN** 两者归一化后指纹一致，判定为疑似重复

#### Scenario: Ignore URL fragments but keep query parameters
- **WHEN** 两条链接仅 fragment 不同
- **THEN** 判定为疑似重复；仅查询参数不同的链接不判定为重复

#### Scenario: Mark duplicates in the inbox list
- **WHEN** 采集箱列表中某条 Source 的指纹命中另一条 Source
- **THEN** 该条显示"疑似重复采集"标记并可跳转原 Source

#### Scenario: Degrade silently on fingerprint failure
- **WHEN** 指纹计算或查询抛出异常
- **THEN** 采集与列表正常返回，不展示疑似重复提示，也不返回错误

#### Scenario: Isolate duplicates per workspace
- **WHEN** 其他 Workspace 存在相同指纹的 Source
- **THEN** 当前用户的采集与列表不把其判定为疑似重复
