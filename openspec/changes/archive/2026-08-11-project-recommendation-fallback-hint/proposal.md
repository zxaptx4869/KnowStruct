## Why

未选项目采集时，AI 项目推荐在低置信度、调用失败或超时的情况下会静默不展示，确认页
项目下拉旁没有任何说明，用户会误以为推荐被漏掉。`ai-archive-suggestion` 主规格已要求
该场景「提示确认时手动选择」，但实现只完成了「不展示推荐」，提示部分缺失。

## What Changes

- 采集后落地页（逐条确认页）的归档项目选择旁，在 Source 处理完成、仍未分配项目、
  无推荐结果且工作区存在项目时，显示「AI 未能可靠判断归档项目，请手动选择」提示。
- 提示仅由前端根据已有响应字段推断，不新增后端字段、不改接口、无数据库迁移。
- 工作区没有项目时不显示该提示（无可选对象，避免误导）；图片在 OCR 完成前不提示。
- 不改变推荐成功时的「AI 已建议归档」banner 行为，不新增「使用/忽略」操作
  （该相邻缺口不在本次范围）。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `ai-archive-suggestion`: 补全「低置信度或失败时提示确认时手动选择」的缺失场景，
  明确提示在确认页归档项目选择旁展示，并限定为处理完成、未分配且工作区存在项目时。

## Impact

- 前端：`frontend/src/pages/SourceConfirmPage.tsx` 增加提示渲染与状态判断，
  `frontend/src/pages/SourceConfirmPage.test.tsx` 增加对应测试；必要时补充少量样式。
- 后端、API、数据模型、迁移：无改动。
- 文档：同步 `openspec/specs/ai-archive-suggestion/spec.md` 后归档本变更。
