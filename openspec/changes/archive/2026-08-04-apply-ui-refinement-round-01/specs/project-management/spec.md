## MODIFIED Requirements

### Requirement: Workspace-scoped project management

系统 SHALL 允许已认证用户在其当前默认个人 Workspace 内创建、列出、查看和编辑项目。客户端 MUST NOT 选择或覆盖项目的 Workspace 归属，系统 MUST 从当前认证上下文推导该归属。

#### Scenario: Create a project in the current workspace
- **WHEN** 已认证用户以有效名称提交项目，并可选提交“项目目标与背景”
- **THEN** 系统在当前 Workspace 内创建项目，并返回可用于进入空知识目录的项目身份

#### Scenario: Reject invalid project input
- **WHEN** 用户提交空白名称、超过 100 字符的名称或超过 500 字符的“项目目标与背景”
- **THEN** 系统拒绝请求，不写入部分项目数据，并返回可定位到字段的验证错误

#### Scenario: List only projects in the current workspace
- **WHEN** 已认证用户打开项目列表
- **THEN** 系统只返回当前 Workspace 的项目，并为每个项目返回实时节点总数和最近更新时间，不伪造尚未实现的正式记录或资料数量

#### Scenario: Hide a project from another workspace
- **WHEN** 已认证用户使用其他 Workspace 的项目标识访问、修改或删除项目
- **THEN** 系统按项目不存在处理，不暴露该标识是否真实存在，也不修改任何数据

### Requirement: Editable project details and lifecycle status

项目 SHALL 包含名称、可选的目标与背景说明和状态。界面 SHALL 以单个“项目目标与背景”字段提交目标与背景信息，该字段最多 500 字符并映射到项目目标；背景字段 SHALL 保留在数据模型中但不通过 P0 界面暴露。状态 MUST 为“规划中”、“进行中”、“已暂停”或“已完成”之一；新项目 MUST 默认为“规划中”。状态 MUST NOT 锁定项目或目录的编辑能力。

#### Scenario: Create a project with the default status
- **WHEN** 用户创建项目时未显式选择状态
- **THEN** 系统将项目保存为“规划中”

#### Scenario: Update project details and status
- **WHEN** 用户修改当前 Workspace 内项目的名称、单个“项目目标与背景”字段或四种允许状态之一
- **THEN** 系统原子保存通过验证的字段、更新修改时间，并仍允许编辑该项目的知识目录；界面提交的“项目目标与背景”写入项目目标

#### Scenario: Reject an overlong combined description
- **WHEN** 用户提交超过 500 字符的“项目目标与背景”
- **THEN** 系统拒绝请求并返回可定位到字段的验证错误，不写入部分项目数据

#### Scenario: Reject an unsupported project status
- **WHEN** 用户提交不在四种允许值内的项目状态
- **THEN** 系统拒绝更新，项目原状态和其他字段保持不变

### Requirement: Responsive project list states

系统 SHALL 在桌面和移动视口提供同一组项目能力，并明确表达首次使用、加载、提交和失败状态。移动端 SHALL 优先使用可扫描项目列表，桌面端 SHALL 使用更密集的列表或表格。

#### Scenario: Show the no-project state
- **WHEN** 当前 Workspace 没有项目
- **THEN** 项目页显示无项目说明和指向右上角“创建项目”的引导文案，不展示额外的空状态按钮；全局采集入口继续通过全局导航可达

#### Scenario: Prevent duplicate project submission
- **WHEN** 项目创建或编辑请求仍在处理中
- **THEN** 界面显示提交中状态并阻止重复提交

#### Scenario: Preserve project input after a known failure
- **WHEN** 项目创建或编辑请求明确失败
- **THEN** 界面保留用户输入、显示可执行的错误提示，并允许修正后重试

#### Scenario: Recover from a project-list loading failure
- **WHEN** 项目列表加载失败
- **THEN** 界面不将失败表示为空 Workspace，而是显示加载失败和重试操作，重试时重新读取权威项目列表
