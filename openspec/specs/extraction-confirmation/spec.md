# extraction-confirmation Specification

## Purpose
TBD - created by archiving change capture-text-to-entry. Update Purpose after archive.
## Requirements
### Requirement: Replaceable AI provider generates pending candidates

系统 SHALL 通过可替换的 AI Provider 抽象为每个可提取 Source 生成一条或多条 Extraction 候选。Provider 选择 MUST 按当前 Source 所属 Workspace 解析：用户已配置 Provider 与 API Key 时优先使用，未配置时回退到部署环境变量。Provider 实现 MUST 支持 OpenAI 兼容 SDK 与可配置 base_url（DeepSeek、豆包视觉等均可配置）。候选 SHALL 包含标题、内容、记录类型、适用条件、置信度与建议归档节点路径（可为空）。AI 输出 MUST 始终保存为待确认候选，不得直接写入正式 Entry。

#### Scenario: Generate candidates from a source
- **WHEN** Source 的 AI 提取步骤执行成功
- **THEN** 系统生成至少一条待确认 Extraction 候选并标记任务处理成功，Source 在采集箱进入待确认状态

#### Scenario: Choose the AI provider by the workspace configuration
- **WHEN** 用户已为其 Workspace 配置 Provider、API Key、base_url 与模型
- **THEN** 请求使用该用户配置调用 OpenAI 兼容接口，结果经结构化校验后保存为候选，无需重启服务

#### Scenario: Fall back to the environment provider
- **WHEN** 用户未配置 Provider 但部署环境变量包含有效 API Key
- **THEN** 系统使用环境变量的 Provider、Key、base_url 与模型执行提取，成功后生成候选

#### Scenario: Fail when the provider is not configured
- **WHEN** 用户未配置 Provider 且部署环境变量也未配置有效 API Key
- **THEN** 系统将任务标记为失败并显示可读的"AI 服务未配置"原因，保留 Source，不创建候选或 Entry

### Requirement: Invalid or empty extraction output is a retryable failure

系统 MUST 在 AI 返回非法结构、校验失败或空候选时将该任务标记为失败，不得把失败当成功，也不得创建 Extraction 或 Entry。

#### Scenario: Reject invalid AI output
- **WHEN** AI Provider 返回无法通过结构化校验的内容或空候选列表
- **THEN** 系统标记任务失败并说明"未生成有效候选"，Source 保留且可重试

#### Scenario: Retry produces candidates without duplication
- **WHEN** 用户重试一个因无效 AI 输出而失败的任务
- **THEN** 系统重新执行提取，成功后仅生成一次候选，不复制 Source、候选或 Entry

### Requirement: Per-candidate confirmation before archiving

系统 SHALL 允许用户逐条编辑并接受或拒绝 Extraction 候选。接受候选时 MUST 要求选择当前 Workspace 内的项目，节点可暂不归档；若提供节点，节点 MUST 属于所选项目。低置信度候选 MUST 有明确提示且不被默认接受；"完成本资料" MUST NOT 替代逐条决定。

#### Scenario: Accept a candidate with a required project
- **WHEN** 用户编辑候选的类型、内容与适用条件后选择当前 Workspace 的项目并接受
- **THEN** 系统按编辑后内容创建正式 Entry（节点为空表示暂不归档），标记该候选已接受，并保留与原始 Source 的关联

#### Scenario: Reject a candidate
- **WHEN** 用户拒绝某条候选
- **THEN** 系统标记该候选已拒绝，不创建 Entry，原始 Source 仍保留

#### Scenario: Block acceptance without a project
- **WHEN** 用户在未选择项目时尝试接受候选
- **THEN** 系统拒绝操作并提示必须在归档前确认项目，候选保持待确认

#### Scenario: Reject a node from another project
- **WHEN** 用户接受候选时选择的节点不属于所选项目
- **THEN** 系统拒绝操作且不创建 Entry，候选与节点均保持不变

#### Scenario: Complete a source only after all candidates are decided
- **WHEN** 用户尝试完成一条仍有未决定候选的 Source
- **THEN** 系统返回冲突并给出剩余待决定数量，不生成任何 Entry

#### Scenario: Show low-confidence candidates without preselecting accept
- **WHEN** 用户打开包含低置信度候选的确认界面
- **THEN** 界面标记低置信度候选并提示检查适用条件，任何候选均不被默认接受

#### Scenario: Preserve confirmation input after a failed submission
- **WHEN** 确认提交明确失败
- **THEN** 界面保留该候选的编辑内容与项目 / 节点选择，允许修正后重新提交，且不重复创建 Entry

### Requirement: Accepted candidates become traceable entries

系统 SHALL 只为已接受候选创建正式 Entry，且 Entry 与 Source 的关联 MUST 可查询。Entry SHALL 归属当前 Workspace 与所选项目，状态默认为已归档；创建过程 MUST 与候选状态更新在同一事务中完成，失败时不得留下部分 Entry。

#### Scenario: Create an entry linked to its source
- **WHEN** 用户接受一条候选且校验通过
- **THEN** 系统创建一条已归档 Entry（含项目、节点可空、类型、标题与内容）并写入其与原始 Source 的关联，关联可在 Entry 与 Source 两侧查询

#### Scenario: Re-submit the same decision without duplicating the entry
- **WHEN** 用户对已决定候选重复提交相同决定
- **THEN** 系统返回原结果，不创建第二条 Entry，也不改变候选状态

#### Scenario: Reject all candidates of a source
- **WHEN** 用户拒绝某 Source 的全部候选并完成本资料
- **THEN** 系统不创建任何 Entry，Source 保留并显示已处理状态

#### Scenario: Keep the extraction undecided on entry creation failure
- **WHEN** 接受校验通过但 Entry 创建中途失败（如节点归属冲突）
- **THEN** 系统回滚整个决定事务，不创建部分 Entry，候选保持待确认

#### Scenario: Hide another workspace's confirmation data
- **WHEN** 已认证用户使用其他 Workspace 的 Source、Extraction、Project 或 Node 标识执行确认
- **THEN** 系统按对应对象不存在处理，不暴露标识是否真实存在，也不修改任何数据

### Requirement: Accepted entries store applicable conditions

系统 SHALL 在接受 Extraction 候选并创建正式 Entry 时，将确认后的适用条件写入 Entry。适用条件为字符串列表，可为空；Entry 的适用条件 MUST 与候选及其确认结果一致，并自包含于正式记录（不依赖回查候选）。

#### Scenario: Save conditions on accept
- **WHEN** 用户接受候选并提交适用条件
- **THEN** 系统创建 Entry 时写入该适用条件，可从 Entry 直接读取

#### Scenario: Preserve candidate conditions when not edited
- **WHEN** 用户未修改适用条件直接接受候选
- **THEN** Entry 保存候选原有的适用条件

#### Scenario: Allow empty conditions
- **WHEN** 用户接受候选且适用条件为空
- **THEN** Entry 的适用条件保持为空，界面按"无适用条件"展示

#### Scenario: Backfill existing entries from their extractions
- **WHEN** 数据库迁移 0006 执行
- **THEN** 已有 Entry 从关联 Extraction 回填适用条件，无关联或无条件记录的适用条件保持为空

### Requirement: Suggest archive node during per-candidate confirmation

逐条确认候选时，系统 SHALL 在用户选定项目后按该项目目录解析候选的 `suggested_node_path`：
置信度达标（≥0.6）且路径全匹配时，MUST 预选归档节点并标注「AI 建议」；部分匹配时 MUST
提供「建议新建缺失段」的显式入口（创建后自动作为归档节点，复用重名/超深/归属校验，失败
显示错误可改选）；低置信度或目录变化导致无法匹配时 MUST 降级为手动选择并给出说明。
解析与新建 MUST NOT 自动创建节点或归档，保持人工确认边界。

#### Scenario: Preselect a matched suggestion
- **WHEN** 候选置信度达标且建议路径全匹配现有节点
- **THEN** 归档节点下拉预选该节点并标注「AI 建议」，接受后按该节点归档

#### Scenario: Create missing path segments explicitly
- **WHEN** 建议路径仅前缀匹配且用户点击「新建该节点」
- **THEN** 系统沿路径创建缺失段，新节点自动成为该候选的归档节点，创建失败显示可读错误

#### Scenario: Fall back to manual selection
- **WHEN** 候选置信度低于 0.6，或建议路径无法匹配且用户未选择新建
- **THEN** 系统不预选节点，界面提示手动选择，确认流程不受影响

#### Scenario: Keep decisions editable before acceptance
- **WHEN** 用户修改预选的归档节点或取消新建
- **THEN** 以用户最终选择为准，建议仅作为初始值
