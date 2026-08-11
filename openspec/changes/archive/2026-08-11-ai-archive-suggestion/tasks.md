## 1. 数据模型与迁移

- [x] 1.1 `sources` 新增推荐字段（`recommended_project_id` FK SET NULL + 索引、
  `recommended_confidence`、`recommended_reason`、`recommended_at`），`extractions`
  新增 `suggested_node_confidence`，编写 Alembic 迁移 0017 并完成真实 MySQL 验证
- [x] 1.2 Source/Extraction 的响应 schema 与 ORM 字段同步，旧数据无推荐字段时按降级处理

## 2. 后端：项目推荐

- [x] 2.1 `AIProvider.recommend_project` 抽象 + openai_compat `request_json_project_recommendation`
  （输出推荐项目/置信度/理由，低置信度返回不推荐）+ demo 确定性实现
- [x] 2.2 文本/链接采集同步推荐：`source_create` 未选项目且项目数 >1 时调用，失败静默降级，
  推荐结果写入 Source 并随详情返回
- [x] 2.3 图片采集：OCR 完成后在提取处理流程内补调推荐（输入 OCR 文本），结果落库
- [x] 2.4 后端测试：多项目推荐、单项目跳过、低置信度不推荐、调用失败降级、图片 OCR 后补调

## 3. 后端：目录感知提取

- [x] 3.1 项目目录路径清单工具函数（整树序列化为路径行，限长）
- [x] 3.2 `extract_candidates` 增加 `directory_paths` 参数并注入提示词；
  `CANDIDATE_SYSTEM_PROMPT` 要求路径取自现有目录或标注「建议新建」并输出
  `suggested_node_confidence`；目录为空/失败降级为现状
- [x] 3.3 `process_source_extraction` 在 Source 有项目时查询目录并传给提取；解析
  `suggested_node_confidence` 落库
- [x] 3.4 后端测试：目录注入后路径来自目录、无目录降级、置信度解析、提取失败重试保持

## 4. 前端：采集推荐展示

- [x] 4.1 采集页项目下拉旁提示「不选择时 AI 将推荐归档项目」；推荐成功显示
  「AI 建议归档：X（置信度/理由）」与「使用 / 忽略」操作；图片 Source 处理完成后刷新展示
- [x] 4.2 类型与 queries 扩展（推荐字段、使用/忽略交互）
- [x] 4.3 组件测试：提示文案、推荐展示、使用/忽略、低置信度无展示

## 5. 前端：确认预选 / 建议新建 / 降级

- [x] 5.1 路径解析工具函数（逐段标准化名称、末段唯一宽容匹配、返回匹配节点或缺失段）
  与单元测试
- [x] 5.2 `SourceConfirmPage`：选项目后解析建议路径——全匹配预选 + 「AI 建议」标注；
  部分匹配提供「新建该节点」选项（调既有节点创建接口，成功后作为归档节点，失败可改选）；
  低置信度/不匹配显示手动选择说明
- [x] 5.3 桌面与 390px 移动端交互一致，组件测试覆盖预选/新建/降级/用户改选

## 6. 验证、同步与收尾

- [x] 6.1 全量验证：后端 `pytest` + `ruff`，前端测试/lint/build，`openspec validate --all --strict`
- [x] 6.2 浏览器验收（桌面 1440 + 移动 390）：采集推荐、提取注入目录、确认预选/新建/降级
- [x] 6.3 同步主规格（新增 `ai-archive-suggestion`，更新 `inbox-processing`、
  `extraction-confirmation`）并归档 change
- [ ] 6.4 推送合并前与用户确认
