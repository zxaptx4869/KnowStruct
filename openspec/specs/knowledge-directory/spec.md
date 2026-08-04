# Knowledge Directory Specification

## Purpose

定义 P0 项目内普通多级知识目录的父子结构、Workspace 隔离、编辑与移动事务、受保护删除规则，以及桌面端和移动端共享数据下的响应式浏览维护体验。

## Requirements

### Requirement: Ordinary multi-level knowledge directory

每个项目 SHALL 拥有一棵由普通父子 Node 组成的知识目录树。系统 SHALL 允许创建根节点和子节点，MUST 将最大深度限制为 6 层，并 MUST 在同一父节点下强制标准化名称唯一。本目录 MUST NOT 使用图数据库或知识图谱节点语义。

#### Scenario: Create root and nested nodes
- **WHEN** 用户在项目空目录中创建“家具家电”，并依次创建子节点“大家电”和“冰箱”
- **THEN** 系统保存三层父子关系，每个节点保持稳定身份且项目节点总数增加为 3

#### Scenario: Reject a seventh-level node
- **WHEN** 用户尝试在第 6 层节点下创建子节点
- **THEN** 系统返回深度冲突，不创建新节点也不修改现有树

#### Scenario: Reject a duplicate sibling name
- **WHEN** 同一父节点下已有“冰箱”，用户尝试以忽略首尾空白和大小写后的同名再创建一个节点
- **THEN** 系统返回同级名称冲突，仅保留原节点

#### Scenario: Allow the same name in different branches
- **WHEN** 用户在不同父节点下分别创建同名节点
- **THEN** 系统允许两个节点并通过不同父链区分其路径

### Requirement: Workspace-safe directory access

系统 MUST 通过节点所属 Project 限定所有目录读写到当前认证 Workspace。节点创建、查看、编辑、移动和删除 MUST 同时验证 Project 与 Node 归属，不得信任客户端传入的 Workspace 或 Project 关系。

#### Scenario: Read nodes in the current project
- **WHEN** 用户请求当前 Workspace 内项目的知识目录
- **THEN** 系统返回该项目的节点身份、父节点、同级顺序、名称、说明和时间字段，不返回其他项目的节点

#### Scenario: Hide a node from another workspace
- **WHEN** 用户使用其他 Workspace 的 Project 或 Node 标识请求节点读写
- **THEN** 系统按项目或节点不存在处理，不暴露标识是否真实存在，也不修改任何树数据

#### Scenario: Reject a parent from another project
- **WHEN** 用户在创建或编辑节点时传入不属于当前 Project 的父节点
- **THEN** 系统拒绝操作并保留两个项目的原目录结构

### Requirement: Editable node details and paths

系统 SHALL 允许用户修改节点名称和可选说明，节点名称 MUST 为去除首尾空白后的 1 至 100 字符，说明 MUST NOT 超过 1000 字符。节点改名 MUST 保留节点和所有后代身份，完整路径 SHALL 由当前父链展示。

#### Scenario: Rename a node without rewriting descendants
- **WHEN** 用户将“大家电”改名为“厨房大家电”
- **THEN** 系统保留该节点及“冰箱”等后代的身份和关系，并在面包屑中显示新名称

#### Scenario: Edit a node description
- **WHEN** 用户提交符合长度的节点说明
- **THEN** 系统保存说明并更新节点修改时间，不改变节点层级或顺序

#### Scenario: Reject an invalid rename
- **WHEN** 用户将节点改为空白、超长或与同级现有节点冲突的名称
- **THEN** 系统拒绝修改，节点原名称、路径和后代保持不变

### Requirement: Atomic node sorting and movement

系统 SHALL 允许在同一父节点内重排节点，以及将完整子树移动到同一 Project 的其他有效父节点或根层。移动 MUST 在一个事务中验证循环、项目归属、移动后子树深度、同级重名和目标位置，任一验证失败时 MUST 保留原树。

#### Scenario: Reorder siblings
- **WHEN** 用户将同一父节点下的“冰箱”移到“洗衣机”之前
- **THEN** 系统原子更新该同级节点的顺序，其他分支和子树关系不变

#### Scenario: Move a subtree to another parent
- **WHEN** 用户将某节点移到同一项目的另一父节点下且移动后最深后代不超过第 6 层
- **THEN** 系统移动该节点及其完整子树，重排旧与新同级，并使后代面包屑反映新路径

#### Scenario: Reject a cyclic move
- **WHEN** 用户尝试将节点移动到自身或其任一后代节点下
- **THEN** 系统返回循环移动冲突，节点的父关系和所有同级顺序保持不变

#### Scenario: Reject a move that exceeds maximum depth
- **WHEN** 移动会使目标子树中任一节点超过第 6 层
- **THEN** 系统返回深度冲突，完整保留移动前的树结构

#### Scenario: Recover after an uncertain move result
- **WHEN** 目录移动请求因网络中断而无法确定结果
- **THEN** 界面不自动重放移动，而是重新读取服务端权威目录并以该结果恢复界面

### Requirement: Protected subtree deletion

系统 SHALL 在明确确认后永久删除选定节点及其完整子树。确认界面 MUST 显示将删除的子树节点数。子树存在受保护 Entry 或其他正式内容引用时，系统 MUST 阻止删除并保留引用关系。

#### Scenario: Delete an empty subtree
- **WHEN** 用户确认删除一个仅包含目录节点且没有受保护内容引用的子树
- **THEN** 系统在单个事务中删除选定节点和全部后代，并更新项目节点总数与父节点空状态

#### Scenario: Cancel subtree deletion
- **WHEN** 用户取消删除子树的确认界面
- **THEN** 系统不发送删除请求，选定节点、后代和顺序均保持不变

#### Scenario: Block deletion of a referenced subtree
- **WHEN** 用户尝试删除存在受保护正式内容引用的节点或子树
- **THEN** 系统返回删除冲突和阻断数量，不删除任何节点或引用

### Requirement: Responsive directory browsing and maintenance

系统 SHALL 在同一响应式 Web 应用中提供桌面和移动目录体验。桌面端 SHALL 使目录树与内容区持续并置，并提供拖拽与等价菜单的排序 / 移动能力；移动端 SHALL 提供逐级浏览、新增子节点、改名和说明编辑，MUST NOT 提供拖拽。

#### Scenario: Show an empty project directory
- **WHEN** 用户进入没有任何节点的项目
- **THEN** 桌面和移动界面都显示空目录说明和“创建第一个节点”操作，不自动采用 AI 生成目录

#### Scenario: Browse and maintain the directory on desktop
- **WHEN** 桌面用户进入有多级节点的项目
- **THEN** 界面显示全局导航、常驻目录树和内容区，允许展开、折叠、切换节点，并通过拖拽或节点菜单执行等价的排序与移动

#### Scenario: Browse and lightly maintain the directory at 390px
- **WHEN** 用户在 390px 移动视口从项目列表进入项目
- **THEN** 界面先展示当前层节点列表，允许逐级进入、返回、创建子节点和改名，且导航、标题和操作不重叠不溢出

#### Scenario: Show an empty node
- **WHEN** 用户打开没有子节点且尚无正式记录的节点
- **THEN** 界面显示节点路径、名称和说明，以及新增子节点的操作，不显示伪造的正式记录数量

#### Scenario: Recover from directory loading failure
- **WHEN** 项目目录加载失败
- **THEN** 界面保留项目上下文，明确显示失败而不是空目录，并提供重新读取权威目录的重试操作

#### Scenario: Preserve node input after a mutation failure
- **WHEN** 节点创建、改名或说明编辑明确失败
- **THEN** 界面保留已输入内容和当前树上下文，阻止重复提交，并允许用户修正后重试
