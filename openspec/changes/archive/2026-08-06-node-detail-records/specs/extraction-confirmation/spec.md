## ADDED Requirements

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
