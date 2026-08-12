## MODIFIED Requirements

### Requirement: Batch confirmation creates traceable entries atomically

系统 MUST 在单个事务内为每条被确认候选创建状态为已归档的正式 Entry（标题、内容、记录
类型、适用条件、关键参数与避坑要点均取自候选现值），写入其与原始 Source 的关联，将候选
标记为已接受并更新 Source 项目归属；Entry 创建与候选状态更新 MUST 在同一事务内完成。
任一条候选校验或创建失败 MUST 回滚整个批次，不留部分 Entry。批量确认 MUST NOT 修改低
置信度候选或其他已决定候选。

#### Scenario: Create entries linked to their sources
- **WHEN** 批量确认成功生成 N 条正式记录
- **THEN** 每条 Entry 都可在 Entry 与 Source 两侧查询到关联，且归属当前 Workspace 与所选项目

#### Scenario: Carry structured fields from candidates
- **WHEN** 被确认候选带有关键参数或避坑要点
- **THEN** 生成的 Entry 保存与候选现值一致的 key_params/risk_points，无需逐条编辑

#### Scenario: Update source project ownership
- **WHEN** 批量确认选择某项目
- **THEN** 被确认来源的归属更新为所选项目，采集箱与详情中的项目归属随之变化

#### Scenario: Roll back the whole batch on any failure
- **WHEN** 批量执行中任一条候选创建失败（如节点归属冲突）
- **THEN** 整个批次回滚，不产生任何部分 Entry，所有候选保持待确认

#### Scenario: Leave low-confidence candidates untouched
- **WHEN** 批量确认完成且存在被排除的低置信度候选
- **THEN** 低置信度候选状态与内容保持不变，仍在采集箱显示待确认
