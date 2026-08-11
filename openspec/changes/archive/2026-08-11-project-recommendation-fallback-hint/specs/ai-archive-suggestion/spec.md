## MODIFIED Requirements

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
  处理中或已分配项目的 Source 不显示该提示

#### Scenario: Hide the hint when no project can be selected
- **WHEN** 工作区没有项目
- **THEN** 即使 Source 未分配也不显示手动选择提示，避免无可选对象时误导用户

#### Scenario: Prefer the user's selected project
- **WHEN** 用户随后手动选择了与其他项目
- **THEN** 归档归属以用户选择为准，AI 推荐仅用于展示与提取上下文
