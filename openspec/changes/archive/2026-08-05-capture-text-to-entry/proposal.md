## Why

用户在装修过程中随手产生大量零散文字与网页链接，但当前采集箱只是前端占位页，无法保存、无法进入 AI 处理，更无法沉淀为正式知识记录。信息必须先低成本收进采集箱（可暂不选择项目），由 AI 生成待确认候选，用户逐条确认后才成为可追溯的正式 Entry；否则记录成本过高，信息容易丢失，后续搜索与来源溯源闭环也无法建立。

## What Changes

- 新增文字 / 链接 Source 采集：全局"采集"入口与项目内"添加资料"入口（预选项目），采集时项目可选并保存为"未分配"；创建正式 Entry 前必须确认项目。
- 新增 Processing Task：MySQL 建表作为队列，状态为待处理 / 处理中 / 处理成功 / 处理失败；提供处理时间线与从失败步骤重试，重试不得复制 Source。
- 新增 AI 候选生成：扩展 AI Provider 抽象接口，实现 DeepSeek Provider（OpenAI 兼容 SDK + base_url），一次生成多条 Extraction 候选；AI 输出始终是候选，不得直接成为正式 Entry。
- 新增逐条确认：桌面端来源 + 候选并排，移动端一屏一条；每条可编辑并接受 / 拒绝，低置信度明确提示，全部候选有决定后才能"完成本资料"。
- 新增 Entry 与来源关联：仅接受候选创建正式 Entry（项目必选、节点可暂不归档），通过 `entry_sources` 保留 Source 关联，满足正式记录来源追溯。
- 落实既有删除保护：项目删除统计已分配 Source 与 Entry 引用，节点子树删除统计归档到节点的 Entry 引用，存在引用时阻断并返回阻断数量。
- 业务数据全部归属当前认证用户的默认 Workspace，跨 Workspace 访问按不存在处理；桌面与移动共用同一响应式 Web App。

## Capabilities

### New Capabilities
- `inbox-processing`: 采集箱文字 / 链接 Source 采集与来源预览、未分配项目、Processing Task 处理队列与状态时间线、失败重试、桌面与移动采集入口。
- `extraction-confirmation`: AI Provider 统一接入（DeepSeek）、Extraction 候选生成、逐条接受 / 拒绝、接受后创建正式 Entry 并保留 Source 关联。

### Modified Capabilities
<!-- 无：项目删除与节点删除的受保护引用检查为既有主规格要求，本切片补齐实现，不改变规格行为。 -->

## Impact

- 后端：新增 Source / ProcessingTask / Extraction / Entry / EntrySource 模型与 Alembic 迁移；新增采集箱 API（创建 Source、列表、详情、重试、确认候选）；新增 `app/ai/deepseek.py` 与 Provider 工厂、进程内任务 worker；`projects.py` / `nodes.py` 的删除保护钩子接入真实引用统计。
- 前端：`InboxPage` 从占位页改为真实采集与处理队列页；新增待确认列表与逐条确认视图（桌面 D04/D05、移动 M02-M05 对应能力）；新增 `inbox` 查询 / 类型 / 组件；项目页增加"添加资料"入口。
- 配置与依赖：新增 `AI_PROVIDER`、`DEEPSEEK_MODEL` 等设置；`openai` SDK 已在依赖中，无需新增包。
- 文档：新增两个能力的 delta specs；按需同步文档路由 / 技术基线状态。
