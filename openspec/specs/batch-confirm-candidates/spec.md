# batch-confirm-candidates Specification

## Purpose

定义来源层批量确认能力：用户可在桌面端采集箱勾选多条待确认 Source，一次归档其中的高置信度 Extraction 候选为正式 Entry。批量确认保持人工确认边界（来源级授权、候选级置信度校验、低置信度候选保持待确认），并沿用整批原子与 Workspace 隔离语义。

## Requirements

### Requirement: Batch confirm pending candidates at source level

系统 SHALL 允许已认证用户对其 Workspace 内多条处于待确认状态的 Source 执行批量确认，将每条 Source 中状态为待确认且置信度不低于 0.7（置信度为 NULL 视为满足）的 Extraction 候选归档为正式 Entry；置信度低于 0.7 的候选 MUST 保持待确认，并在批量结果中计数。批量确认 MUST 要求选择当前 Workspace 内的项目，节点为可选且 MUST 属于所选项目。空请求、超过 100 条 Source、任一条 Source 不存在或属于其他 Workspace、任一条 Source 不处于待确认状态、任一条 Source 没有任何可批量确认候选、或全部候选总数超过 200 时，MUST 整批拒绝并返回可读原因，不产生部分成功。已成功确认的批次重复提交 MUST 返回冲突且不重复创建 Entry。

#### Scenario: Confirm high-confidence candidates across sources
- **WHEN** 用户批量确认 2 条待确认 Source，每条各有 1-2 条置信度不低于 0.7 的候选，并选择当前 Workspace 的项目
- **THEN** 每条可确认候选在一个事务内生成正式 Entry 并关联其原始 Source，Source 归属更新到所选项目，响应返回确认来源数与创建 Entry 数

#### Scenario: Skip low-confidence candidates with a count
- **WHEN** 选中来源中某候选置信度低于 0.7
- **THEN** 该候选不被归档、保持待确认，响应返回跳过低置信度候选数量，其余候选正常确认

#### Scenario: Require a project for batch acceptance
- **WHEN** 用户未选择项目就提交批量确认
- **THEN** 系统整批拒绝并提示必须选择归档项目，不创建任何 Entry

#### Scenario: Reject a node from another project
- **WHEN** 用户批量确认时提供的统一归档节点不属于所选项目
- **THEN** 系统整批拒绝且不创建 Entry，候选与来源均保持不变

#### Scenario: Reject a batch containing a non-pending source
- **WHEN** 批量请求中某条 Source 已处理、处理中或失败
- **THEN** 系统整批拒绝并返回可读冲突，所有 Source 与候选保持不变

#### Scenario: Reject a source without confirmable candidates
- **WHEN** 批量请求中某条 Source 的全部候选均低于置信度阈值（或没有任何候选）
- **THEN** 系统整批拒绝并提示该来源没有可批量确认的候选

#### Scenario: Reject empty, oversized, or foreign batches
- **WHEN** 批量请求为空、Source 超过 100 条、全部候选超过 200 条、或包含其他 Workspace 的 Source 标识
- **THEN** 系统整批拒绝并返回可读错误，不修改任何数据，也不暴露标识是否真实存在

#### Scenario: Block duplicate submission
- **WHEN** 用户对已成功确认的同一批 Source 再次提交批量确认
- **THEN** 系统返回冲突，不创建第二条 Entry，也不改变已有记录

### Requirement: Batch confirmation creates traceable entries atomically

系统 MUST 在单个事务内为每条被确认候选创建状态为已归档的正式 Entry（标题、内容、记录类型与适用条件取自候选现值），写入其与原始 Source 的关联，将候选标记为已接受并更新 Source 项目归属；Entry 创建与候选状态更新 MUST 在同一事务内完成。任一条候选校验或创建失败 MUST 回滚整个批次，不留部分 Entry。批量确认 MUST NOT 修改低置信度候选或其他已决定候选。

#### Scenario: Create entries linked to their sources
- **WHEN** 批量确认成功生成 N 条正式记录
- **THEN** 每条 Entry 都可在 Entry 与 Source 两侧查询到关联，且归属当前 Workspace 与所选项目

#### Scenario: Update source project ownership
- **WHEN** 批量确认选择某项目
- **THEN** 被确认来源的归属更新为所选项目，采集箱与详情中的项目归属随之变化

#### Scenario: Roll back the whole batch on any failure
- **WHEN** 批量执行中任一条候选创建失败（如节点归属冲突）
- **THEN** 整个批次回滚，不产生任何部分 Entry，所有候选保持待确认

#### Scenario: Leave low-confidence candidates untouched
- **WHEN** 批量确认完成且存在被排除的低置信度候选
- **THEN** 低置信度候选状态与内容保持不变，仍在采集箱显示待确认

### Requirement: Batch confirm dialog preview and exclusion

批量确认弹窗 SHALL 在提交前展示每条选中 Source 的只读候选预览（标题、记录类型、置信度）与来源级勾选（默认全选）；低置信度候选 MUST 明确标记为「不纳入批量」且不可单独勾选；没有任何可批量确认候选的 Source MUST 禁用勾选并提示。弹窗 MUST 提供当前 Workspace 内项目选择（必选）与可选统一归档节点（默认暂不归档）；确认按钮展示的生成数量 MUST 随勾选与候选变化实时更新。弹窗内 MUST NOT 提供候选级操作或跳转出口；取消勾选的来源 MUST 不参与提交。批量确认入口仅桌面端可见，移动端 MUST NOT 显示。提交失败 MUST 保留弹窗的项目、节点与勾选状态并可修正后重试。

#### Scenario: Preview candidates grouped by source
- **WHEN** 用户打开批量确认弹窗
- **THEN** 弹窗按来源分组展示候选标题、类型与置信度，用户无需离开弹窗即可看到将生成的内容

#### Scenario: Uncheck a source to exclude it
- **WHEN** 用户取消勾选某来源
- **THEN** 该来源全部候选退出本次批量，确认按钮计数随之减少

#### Scenario: Disable sources without confirmable candidates
- **WHEN** 某来源没有任何可批量确认候选（全部低置信度或无可确认候选）
- **THEN** 该来源的勾选被禁用并显示「无可批量确认候选」提示

#### Scenario: Mark low-confidence candidates as excluded
- **WHEN** 候选预览中存在低置信度候选
- **THEN** 该候选标灰并标注「不纳入批量」，不会计入确认数量

#### Scenario: Require project selection before submitting
- **WHEN** 用户未选择项目
- **THEN** 确认按钮不可提交，并提示必须先选择归档项目

#### Scenario: Show the exact number to be created
- **WHEN** 用户调整来源勾选或项目选择
- **THEN** 确认按钮实时显示「确认生成 N 条正式记录」，N 与勾选来源的可确认候选总数一致

#### Scenario: Keep the dialog state on failure
- **WHEN** 批量确认提交失败
- **THEN** 弹窗不关闭，来源勾选、项目、节点与错误原因全部保留，可修正后重试

#### Scenario: Hide the batch entry on mobile
- **WHEN** 用户在 390px 移动视口打开采集箱
- **THEN** 不显示批量确认入口，保持逐条确认流程

### Requirement: Batch confirmation result and inbox refresh

批量确认成功 SHALL 返回确认的来源数、创建的 Entry 数与跳过低置信度候选数；采集箱列表 MUST 在成功后刷新：全部候选已决定的 Source 显示已处理，仍有低置信度候选的 Source 保持待确认。前端 SHALL 在成功后关闭弹窗并显示结果提示。

#### Scenario: Report created and skipped counts
- **WHEN** 批量确认完成
- **THEN** 前端显示「已确认 X 条来源，生成 Y 条正式记录」；跳过低置信度候选数大于零时一并提示

#### Scenario: Refresh the inbox after confirmation
- **WHEN** 批量确认成功后回到采集箱
- **THEN** 列表状态已刷新，无需整页刷新或重新筛选

#### Scenario: Keep partially confirmed sources pending
- **WHEN** 某来源部分候选被批量确认、仍有低置信度候选未决定
- **THEN** 该来源仍显示待确认并可进入确认页逐条处理剩余候选
