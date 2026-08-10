## MODIFIED Requirements

### Requirement: Search page filter interaction

搜索页 SHALL 提供范围与记录类型两个筛选控件。范围控件 SHALL 以选择器形式提供
「全部项目 / 项目 / 项目内节点」单选：点击项目行选择该项目并清除已选节点；展开项目行后
SHALL 按树形展示其节点并可选择其中任一节点，选择节点同时确定项目与节点；面板 MUST 提供
回到「全部项目」的操作。节点选项 MUST 随所选项目联动，切换项目 MUST 清空已选节点。
筛选状态 MUST 持久化到 URL query，刷新与前进后退保持。带 `?q=` 打开页面 SHALL 自动执行
一次搜索；已展示结果时变更筛选 SHALL 立即重新搜索；未输入关键词时变更筛选 MUST 不发起
请求。筛选条件下无结果 SHALL 提供清除筛选操作；URL 携带非法筛选参数 SHALL 显示可读错误
并提供清除筛选。页面 MUST 在桌面与 390px 移动视口均可用，控件不横向溢出。

#### Scenario: Select a project from the scope picker
- **WHEN** 用户在范围选择器中点击某项目行
- **THEN** 范围变为该项目，URL 携带 `project` 参数且不含 `node`，搜索按该项目范围执行

#### Scenario: Select a node from the scope picker
- **WHEN** 用户在范围选择器中展开项目并点击其中某节点
- **THEN** 范围变为「项目 / 节点」，URL 同时携带 `project` 与 `node` 参数，搜索按该节点执行

#### Scenario: Load node options for the expanded project
- **WHEN** 用户在范围选择器中展开某项目
- **THEN** 面板显示该项目下的节点选项，并可选择其中任一节点

#### Scenario: Reset the node when the project changes
- **WHEN** 用户已选择某项目下的节点后切换项目
- **THEN** 已选节点被清空，URL 中的节点参数被移除，节点选项按新项目重新加载

#### Scenario: Clear back to all projects
- **WHEN** 用户已选择项目或节点后点击「全部项目」
- **THEN** 范围清空，URL 移除 `project` 与 `node` 参数，搜索恢复全项目

#### Scenario: Persist filters in the URL
- **WHEN** 用户搜索关键词并选择范围与类型
- **THEN** URL 携带 `q`、`project`、`type`、`node` 参数，刷新后关键词与筛选条件均保持

#### Scenario: Restore filters from the URL on load
- **WHEN** 用户打开带 `?q=&project=&type=&node=` 的搜索页
- **THEN** 页面自动执行一次带该关键词与筛选条件的搜索，范围与类型控件回显对应值

#### Scenario: Re-run the search when a filter changes after results
- **WHEN** 搜索结果已展示且用户变更范围或类型
- **THEN** 页面立即以当前关键词与新的筛选条件重新搜索，无需再次点击搜索

#### Scenario: Show a clearable empty state under filters
- **WHEN** 关键词与筛选组合下没有命中任何 Entry 或 Source
- **THEN** 页面显示无结果状态，并提供清除筛选以恢复全量搜索的操作

#### Scenario: Recover from invalid URL filter parameters
- **WHEN** URL 携带的 `project`、`type` 或 `node` 参数非法，搜索返回可读错误
- **THEN** 页面保留关键词与合法筛选，显示错误并提供清除筛选操作

#### Scenario: Render filters on mobile
- **WHEN** 用户在 390px 移动视口打开搜索页并选择范围与类型
- **THEN** 范围选择器、类型筛选、输入框与结果卡片均可用且不横向溢出
