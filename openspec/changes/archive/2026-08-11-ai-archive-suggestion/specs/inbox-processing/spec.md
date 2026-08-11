# Inbox Processing Specification (delta)

## ADDED Requirements

### Requirement: Recommended archive project on capture

采集界面 SHALL 保持归档项目为非必填，并在项目选择旁提示「不选择时 AI 将推荐归档项目」。
提交文本/链接采集且未选项目时，系统 SHALL 返回项目推荐（推荐项目、置信度与理由，规则见
`ai-archive-suggestion` 主规格）；图片采集在 OCR 完成后返回推荐。推荐展示 MUST 提供
「使用」与「忽略」操作，且不改变采集本身的成功/失败语义——推荐失败或低置信度时采集
MUST 仍成功，仅不展示推荐。

#### Scenario: Show the hint next to the project selector
- **WHEN** 用户进入采集界面且项目选择为空
- **THEN** 项目下拉旁显示「不选择时 AI 将推荐归档项目」提示

#### Scenario: Show and accept a recommendation
- **WHEN** 未选项目提交文本采集且推荐置信度达标
- **THEN** 采集结果展示「AI 建议归档：X（置信度）」与「使用」操作，点击后该 Source 使用
  推荐项目作为提取上下文

#### Scenario: Ignore the recommendation
- **WHEN** 用户点击「忽略」
- **THEN** 推荐仍保存在 Source 上，但提取上下文不使用推荐项目，确认时手动选择
