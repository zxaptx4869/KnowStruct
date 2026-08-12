# AI Archive Suggestion Specification

## Purpose

定义采集内容归档时的 AI 建议能力：未选项目时轻量推荐项目（带置信度与理由），提取时基于
该项目目录生成归档节点建议（带置信度），确认时解析建议路径（预选/显式新建/低置信度降级），
降低手工整理成本，同时保持「AI 只建议、用户确认才归档」的边界。

## Requirements

### Requirement: Project recommendation on capture

系统 SHALL 在采集提交时提供项目推荐：用户未选项目且工作区项目数大于 1 时，MUST 基于
内容与项目名称/背景生成推荐，返回推荐项目、置信度与理由；项目数不大于 1 时 MUST NOT
调用模型（唯一项目直接作为推荐）。文本/链接 Source 在采集提交时同步推荐；图片 Source
在 OCR 完成后补调推荐。推荐置信度低于阈值（0.6）或调用失败/超时时 MUST 不展示推荐，
并在确认页归档项目选择旁提示确认时手动选择；推荐达标时 MUST 自动设置 Source 的项目
归属（用户可后续改选，推荐不覆盖用户已选项目），推荐结果与置信度持久化在 Source 上。

#### Scenario: Recommend a project when none is selected
- **WHEN** 用户未选项目提交文本采集，且工作区有多个项目
- **THEN** 系统返回推荐项目（置信度 ≥ 0.6 时）并自动设置 Source 项目归属，界面显示
  「AI 已建议归档：X（置信度）」且可在项目下拉修改

#### Scenario: Recommend for images after OCR
- **WHEN** 用户上传图片且未选项目
- **THEN** OCR 完成后系统基于识别文本补调推荐，处理完成后界面展示推荐结果

#### Scenario: Skip recommendation with a single project
- **WHEN** 工作区只有一个项目
- **THEN** 系统不调用模型，直接以该唯一项目作为推荐

#### Scenario: Suppress low-confidence or failed recommendations
- **WHEN** 推荐置信度低于 0.6，或推荐调用失败/超时
- **THEN** 界面不展示推荐项目，Source 保持未分配，确认页归档项目选择旁提示
  「AI 未能可靠判断归档项目，请手动选择」，采集与提取不阻塞

#### Scenario: Show the hint only after processing completes
- **WHEN** Source 不在处理中（已处理或待确认）、仍未分配项目、无推荐结果且工作区存在项目
- **THEN** 确认页归档项目选择旁显示「AI 未能可靠判断归档项目，请手动选择」；
  处理中、用户已在页面选择项目、已分配项目或全部候选已决定的 Source 不显示该提示

#### Scenario: Hide the hint when no project can be selected
- **WHEN** 工作区没有项目
- **THEN** 即使 Source 未分配也不显示手动选择提示，避免无可选对象时误导用户

#### Scenario: Prefer the user's selected project
- **WHEN** 用户随后手动选择了与其他项目
- **THEN** 归档归属以用户选择为准，AI 推荐仅用于展示与提取上下文

### Requirement: Directory-aware extraction suggestions

系统 SHALL 在提取候选时，若 Source 已确定项目（用户所选或 AI 推荐），将该项目的目录
路径清单注入提取提示词，并要求候选的 `suggested_node_path` 取自现有目录（或标注
「建议新建：」）且输出 `suggested_node_confidence`。目录查询失败或路径清单为空时 MUST
不带目录降级为现状。建议置信度低于阈值（0.6）时确认流程 MUST 不预选节点并给出说明。

#### Scenario: Inject the project directory into extraction
- **WHEN** Source 已确定项目且该项目存在目录节点
- **THEN** 提取提示词包含目录路径清单，候选节点建议路径来自该目录

#### Scenario: Fall back without directory context
- **WHEN** 目录查询失败或项目目录为空
- **THEN** 提取按无目录上下文执行，建议路径可为自由文本，确认流程按低置信度处理

#### Scenario: Carry suggestion confidence on candidates
- **WHEN** 提取候选返回节点建议
- **THEN** 候选携带 `suggested_node_confidence`，供确认流程判断是否预选

### Requirement: Confirm-time suggestion resolution

逐条确认时，系统 SHALL 在用户选定项目后按目录解析候选的建议路径：全匹配（逐段标准化
名称、末段唯一宽容）MUST 预选节点并标注「AI 建议」；部分匹配 MUST 提供「建议新建缺失段」
的显式入口（点击后沿路径创建缺失段并自动作为归档节点，复用重名/超深/归属校验，失败显示
错误可改选）；低置信度或目录变化导致无法匹配时 MUST 降级为手动选择并给出说明。建议解析
与新建操作 MUST 保持人工确认边界，不自动创建节点或归档。

#### Scenario: Preselect a fully matched path
- **WHEN** 建议路径逐段匹配到现有节点且置信度达标
- **THEN** 节点下拉预选该节点并标注「AI 建议」，用户可直接确认

#### Scenario: Offer explicit creation for partially matched paths
- **WHEN** 建议路径仅前缀匹配，缺失末段
- **THEN** 界面提示「建议新建：缺失段（父：已匹配前缀）」并提供「新建该节点」选项，
  点击后创建缺失段并自动作为归档节点

#### Scenario: Degrade gracefully on low confidence
- **WHEN** 建议置信度低于 0.6
- **THEN** 不预选节点，界面提示「AI 未能可靠判断归档节点，请手动选择」

#### Scenario: Handle directory changes after extraction
- **WHEN** 提取后目录变化导致建议路径无法匹配
- **THEN** 按「建议新建/手动选择」分支处理，不阻塞确认

### Requirement: Mobile consistency

项目推荐展示、节点预选、建议新建与降级提示 SHALL 在桌面与 390px 移动端一致可用，不改变
采集/确认的既有响应式布局。

#### Scenario: Show suggestions on mobile
- **WHEN** 用户在 390px 移动视口完成采集或逐条确认
- **THEN** 推荐与建议提示正常展示，操作可点击且不横向溢出

### Requirement: Project summary for recommendation

系统 SHALL 为存在目录节点的项目生成项目概要：AI 基于节点路径与说明归纳，约 100-150 字，
保留最具区分度的城市、主题与关键节点名。概要 MUST 基于节点结构签名缓存——节点改名、增删
或说明变化使签名变化视为过期，节点排序变化 MUST NOT 使签名变化。概要过期或缺失时 SHOULD
由后台异步重建（不阻塞采集），项目推荐输入 MUST 优先使用概要，概要缺失时降级为项目名称
与背景。

#### Scenario: Generate a project summary from the directory
- **WHEN** 项目存在目录节点且概要缺失或结构过期
- **THEN** 后台生成概要并落库，概要概括项目覆盖的城市、主题与关键节点

#### Scenario: Reorder does not invalidate the summary
- **WHEN** 用户仅调整节点排序
- **THEN** 结构签名不变，概要保持有效，不触发重建

#### Scenario: Rename or add nodes invalidates the summary
- **WHEN** 用户改名、新增或删除节点，或修改节点说明
- **THEN** 结构签名变化，概要在下次使用时被标记过期并由后台重建

#### Scenario: Fall back without a summary
- **WHEN** 项目尚未生成概要或概要生成失败
- **THEN** 项目推荐按名称与背景判断，采集与推荐不阻塞
