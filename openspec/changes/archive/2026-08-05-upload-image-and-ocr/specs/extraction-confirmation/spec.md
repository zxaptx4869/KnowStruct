## MODIFIED Requirements

### Requirement: Replaceable AI provider generates pending candidates

系统 SHALL 通过可替换的 AI Provider 抽象为每个可提取 Source 生成一条或多条 Extraction 候选。Provider 选择 MUST 按当前 Source 所属 Workspace 解析：用户已配置 Provider 与 API Key 时优先使用，未配置时回退到部署环境变量。Provider 实现 MUST 支持 OpenAI 兼容 SDK 与可配置 base_url（DeepSeek、豆包视觉等均可配置）。候选 SHALL 包含标题、内容、记录类型、适用条件、置信度与建议归档节点路径（可为空）。AI 输出 MUST 始终保存为待确认候选，不得直接写入正式 Entry。

#### Scenario: Generate candidates from a source
- **WHEN** Source 的 AI 提取步骤执行成功
- **THEN** 系统生成至少一条待确认 Extraction 候选并标记任务处理成功，Source 在采集箱进入待确认状态

#### Scenario: Choose the AI provider by the workspace configuration
- **WHEN** 用户已为其 Workspace 配置 Provider、API Key、base_url 与模型
- **THEN** 请求使用该用户配置调用 OpenAI 兼容接口，结果经结构化校验后保存为候选，无需重启服务

#### Scenario: Fall back to the environment provider
- **WHEN** 用户未配置 Provider 但部署环境变量包含有效 API Key
- **THEN** 系统使用环境变量的 Provider、Key、base_url 与模型执行提取，成功后生成候选

#### Scenario: Fail when the provider is not configured
- **WHEN** 用户未配置 Provider 且部署环境变量也未配置有效 API Key
- **THEN** 系统将任务标记为失败并显示可读的"AI 服务未配置"原因，保留 Source，不创建候选或 Entry
