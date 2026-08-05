## 1. 数据模型与迁移

- [x] 1.1 新增 Source / ProcessingTask / Extraction / Entry / EntrySource 模型与状态枚举（workspace 作用域、内容状态与处理状态分离、检查约束），并导出到 `app/models/__init__.py`
- [x] 1.2 新增 Alembic 迁移 `0003_capture_text_to_entry`：创建五张表、索引与检查约束，并在真实 MySQL 验证升级与降级

## 2. 采集与处理队列后端

- [x] 2.1 新增 Pydantic schemas：SourceCreate / SourceResponse / SourceListResponse、任务信息、ExtractionResponse、DecideRequest、CompleteResponse
- [x] 2.2 实现采集服务：文字（strip 后 1..20000、标题自动取首行）与链接（合法 http(s) URL + 必填补充说明 1..2000）校验；项目归属校验（其他 Workspace 按不存在处理）；同一事务创建 Source + 待处理任务
- [x] 2.3 实现列表与详情查询：派生处理状态（处理中 / 失败 / 待确认 / 已处理）、候选数量统计、`state / source_type / project_id / q` 筛选、Workspace 隔离、倒序硬上限
- [x] 2.4 实现任务执行：乐观领取（`UPDATE ... WHERE status='pending'`）、调用 AI Provider、成功事务写入候选、失败记录步骤与原因、stale running 超时恢复、lifespan 启动进程内 worker
- [x] 2.5 实现重试端点：仅失败任务可重试（否则 409），重置为待处理并增加尝试次数，不复制 Source 或候选
- [x] 2.6 挂载 `/api/inbox` 路由与错误映射（422 / 404 / 409）

## 3. AI Provider

- [x] 3.1 扩展 `app/ai/base.py`：新增 `extract_candidates(content, content_type) -> list[ExtractionResult]` 抽象方法，保留现有方法
- [x] 3.2 实现 `app/ai/deepseek.py`：OpenAI 兼容 SDK + 可配置 `base_url`，结构化 JSON 输出，经 Pydantic 校验（类型枚举、置信度范围），非法或空结果抛可重试错误
- [x] 3.3 实现 Provider 工厂与配置：`AI_PROVIDER` / `DEEPSEEK_MODEL` 设置，未配置 API Key 时任务明确失败
- [x] 3.4 新增 FakeAIProvider 测试替身（成功 / 空候选 / 抛错三种行为），供测试依赖注入

## 4. 确认与 Entry 后端

- [x] 4.1 实现决定服务：接受 / 拒绝单条候选；接受必选项目（Workspace 内）、节点可选且必须属于项目；编辑字段生效；同一事务更新候选状态 + 创建 Entry + 写入 entry_sources；重复提交相同决定幂等不重复建 Entry
- [x] 4.2 实现"完成本资料"服务：存在未决定候选时返回 409 与剩余数量，全部决定后返回接受 / 拒绝统计
- [x] 4.3 落地删除保护钩子：`count_project_content_references` 统计已分配 Source 与 Entry；`count_protected_node_references` 统计归档到被删子树的 Entry

## 5. 后端测试

- [x] 5.1 采集 API 测试：正常 / 空与超长 / 非法链接 / 跨 Workspace 项目 / 空采集箱
- [x] 5.2 任务与重试测试：失败保留 Source、重试不复制 Source 与候选、非失败任务重试被拒、并发重试只执行一次、stale running 恢复
- [x] 5.3 确认与 Entry 测试：接受（含编辑）与拒绝、无项目阻断、节点跨项目阻断、重复提交幂等、完成校验、创建中途失败回滚
- [x] 5.4 删除保护测试：含 Source / Entry 的项目删除被阻断；含 Entry 的节点子树删除被阻断
- [x] 5.5 迁移与真实 MySQL 冒烟验证（`_test` 库），后端 `pytest -q` 与 `ruff check .` 全绿

## 6. 前端

- [x] 6.1 新增 inbox 类型与查询层（列表 / 详情 / 创建 / 重试 / 决定 / 完成，处理中轮询约 3 秒）
- [x] 6.2 改造采集箱页：文字 / 链接采集表单（项目可选、图片模式禁用占位）、字段校验错误保留输入、提交中防重复提交
- [x] 6.3 采集箱队列：桌面表格（来源 / 项目 / 状态 / 候选 / 操作）+ 筛选；移动卡片 + 状态 chips（待确认 / 处理中 / 失败 / 未分配）
- [x] 6.4 新增确认页：桌面来源 + 候选并排与确认进度；移动一屏一条（上 / 下一条 + 进度）；逐条编辑与接受 / 拒绝、低置信度提示、全部决定后"完成本资料"
- [x] 6.5 项目页新增"添加资料"入口，经 `/inbox?project=<id>` 预选项目
- [x] 6.6 前端测试、`npm test -- --run`、`npm run lint`、`npm run build` 全绿

## 7. 验收与文档

- [x] 7.1 使用真实装修文字 / 链接资料完成端到端浏览器验收（桌面 1440px 与 390px 移动）：采集 → AI 候选 → 逐条确认 → Entry → 来源关联可见；失败与重试流程实测
- [x] 7.2 `openspec validate --all --strict` 通过
- [x] 7.3 同步文档路由 / 技术基线状态（采集、队列、AI Provider 已实现标注）
- [x] 7.4 归档 Change：sync specs 到主规格、归档、提交（不遗留未处理冲突）
