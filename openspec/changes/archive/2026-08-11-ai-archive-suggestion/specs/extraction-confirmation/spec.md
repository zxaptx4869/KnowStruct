# Extraction Confirmation Specification (delta)

## ADDED Requirements

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
