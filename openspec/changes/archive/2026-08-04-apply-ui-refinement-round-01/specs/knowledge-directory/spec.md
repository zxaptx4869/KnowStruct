## MODIFIED Requirements

### Requirement: Editable node details and paths

系统 SHALL 允许用户修改节点名称；节点名称 MUST 为去除首尾空白后的 1 至 100 字符。节点说明 SHALL 在界面中仅作展示，P0 MUST NOT 提供节点说明的创建或编辑入口；说明字段 SHALL 保留在数据模型中供后续能力使用。节点改名 MUST 保留节点和所有后代身份，完整路径 SHALL 由当前父链展示。

#### Scenario: Rename a node without rewriting descendants
- **WHEN** 用户将“大家电”改名为“厨房大家电”
- **THEN** 系统保留该节点及“冰箱”等后代的身份和关系，并在面包屑中显示新名称

#### Scenario: Show a node description without editing
- **WHEN** 用户打开包含说明的节点
- **THEN** 界面展示节点名称与说明，且不提供说明的创建或编辑入口

#### Scenario: Reject an invalid rename
- **WHEN** 用户将节点改为空白、超长或与同级现有节点冲突的名称
- **THEN** 系统拒绝修改，节点原名称、路径和后代保持不变

### Requirement: Responsive directory browsing and maintenance

系统 SHALL 在同一响应式 Web 应用中提供桌面和移动目录体验。桌面端 SHALL 使目录树与内容区持续并置，并提供拖拽与等价菜单的排序 / 移动能力；移动端 SHALL 提供逐级浏览、创建子节点、改名和节点操作菜单，MUST NOT 提供拖拽；节点操作菜单 SHALL 提供与桌面等价的编辑、移动到和删除子树能力。

#### Scenario: Show an empty project directory
- **WHEN** 用户进入没有任何节点的项目
- **THEN** 桌面和移动界面都显示空目录说明和“创建第一个节点”主操作，不自动采用 AI 生成目录

#### Scenario: Browse and maintain the directory on desktop
- **WHEN** 桌面用户进入有多级节点的项目
- **THEN** 界面显示全局导航、常驻目录树和内容区，允许展开、折叠、切换节点，并通过拖拽或节点菜单执行等价的排序与移动

#### Scenario: Browse and lightly maintain the directory at 390px
- **WHEN** 用户在 390px 移动视口从项目列表进入项目
- **THEN** 界面先展示当前层节点列表，允许逐级进入、返回、创建子节点、改名，并通过节点菜单执行移动与删除，且导航、标题和操作不重叠不溢出

#### Scenario: Show an empty node
- **WHEN** 用户打开没有子节点且尚无正式记录的节点
- **THEN** 界面显示节点路径、名称和说明，以及新增子节点的操作，不显示伪造的正式记录数量

#### Scenario: Recover from directory loading failure
- **WHEN** 项目目录加载失败
- **THEN** 界面保留项目上下文，明确显示失败而不是空目录，并提供重新读取权威目录的重试操作

#### Scenario: Preserve node input after a mutation failure
- **WHEN** 节点创建或改名明确失败
- **THEN** 界面保留已输入内容和当前树上下文，阻止重复提交，并允许用户修正后重试
