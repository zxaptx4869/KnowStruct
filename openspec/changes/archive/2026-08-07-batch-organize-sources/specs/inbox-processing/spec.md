## ADDED Requirements

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

系统 SHALL 为 Workspace 内的 Source 计算去重指纹：text 对去除首尾空白并折叠连续空白后的全文计算 SHA-256；link 对规范化 URL（scheme 与 host 转小写、去除首尾空白、去除 fragment，保留查询参数）计算 SHA-256；image 对每个附件文件原始字节计算 SHA-256。采集提交成功时，系统 MUST 返回该 Source 是否命中当前 Workspace 内已有相同指纹的 Source（含原 Source 标题与采集时间）；命中 MUST NOT 阻断创建。采集箱列表 MUST 为命中指纹的 Source 标记"疑似重复"并指向原 Source。指纹计算或查询失败 MUST 静默降级，不影响采集与列表展示。

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
- **THEN** 该条显示"疑似重复"标记并可跳转原 Source

#### Scenario: Degrade silently on fingerprint failure
- **WHEN** 指纹计算或查询抛出异常
- **THEN** 采集与列表正常返回，不展示疑似重复提示，也不返回错误

#### Scenario: Isolate duplicates per workspace
- **WHEN** 其他 Workspace 存在相同指纹的 Source
- **THEN** 当前用户的采集与列表不把其判定为疑似重复
