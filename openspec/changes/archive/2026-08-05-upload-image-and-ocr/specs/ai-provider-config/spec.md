## ADDED Requirements

### Requirement: Per-workspace AI provider configuration

系统 SHALL 允许已认证用户在其 Workspace 内配置 AI 提取所用的 Provider、API Key、base_url 与模型。配置 MUST 归属当前 Workspace 并加密存储，绝不落明文；其他 Workspace 的用户 MUST 按配置不存在处理。用户未配置时系统 MUST 回退到部署环境变量。

#### Scenario: Save an AI provider configuration
- **WHEN** 用户提交 Provider（如 deepseek 或 doubao）、API Key 及可选的 base_url 与模型
- **THEN** 系统加密保存到当前 Workspace 的配置，返回掩码后的 Key 与配置摘要，不回显完整 Key

#### Scenario: Save configuration with an existing key
- **WHEN** 用户更新 base_url 或模型但未提供新的 API Key
- **THEN** 系统保留原加密 Key，仅更新其他字段，返回掩码后的 Key

#### Scenario: Delete the workspace configuration
- **WHEN** 用户删除当前 Workspace 的 AI 配置
- **THEN** 系统删除该配置，后续提取按部署环境变量解析 Provider

#### Scenario: Hide another workspace's configuration
- **WHEN** 已认证用户使用其他 Workspace 的配置标识读取或修改
- **THEN** 系统按配置不存在处理，不暴露配置是否真实存在

### Requirement: Masked key exposure and secure storage

系统 MUST 在任何 API 响应、错误消息与日志中都不包含完整 API Key；读取时只返回掩码。API Key 密文 MUST 使用密钥派生机制加密（生产使用独立加密密钥），密钥变更后的旧密文不可解密时 MUST 提供可执行的删除 / 重配路径。

#### Scenario: Retrieve a masked key
- **WHEN** 已配置的用户读取 AI 配置
- **THEN** 系统返回掩码 Key（保留前 3 位与后 4 位，不足 8 位显示 `***`），响应中不含完整 Key

#### Scenario: Provider errors do not leak the key
- **WHEN** 使用用户配置的 Provider 调用失败
- **THEN** 系统记录并返回可读错误，错误与日志均不包含完整 API Key

#### Scenario: Undecryptable stored key is recoverable
- **WHEN** 加密密钥轮换导致存量密文无法解密
- **THEN** 系统返回配置损坏提示，允许用户重新提交 Key 覆盖，且不影响其他业务数据

### Requirement: Runtime provider resolution from user configuration

系统 SHALL 在处理任务时按当前 Source 所属 Workspace 解析 Provider：用户配置优先，环境变量回退；配置变更后下一次任务执行 MUST 立即生效，无需重启服务。解析不到任何有效配置时 MUST 将任务标记为失败并给出可读的"AI 服务未配置"原因，Source 保留且可重试。

#### Scenario: Use the workspace provider for extraction
- **WHEN** 用户已配置 Provider 且某 Source 进入 AI 提取阶段
- **THEN** 系统使用该 Workspace 的 Provider、Key、base_url 与模型调用，成功后生成候选

#### Scenario: Fall back to environment configuration
- **WHEN** 用户未配置 Provider 但部署环境变量配置了有效 Key
- **THEN** 系统使用环境变量的 Provider 与 Key 执行提取

#### Scenario: Configuration change applies without restart
- **WHEN** 用户在两次任务之间更新了 API Key
- **THEN** 后续任务立即使用新 Key，旧 Key 不再被使用

#### Scenario: Fail readably when nothing is configured
- **WHEN** 用户未配置 Provider 且环境变量也未配置有效 Key
- **THEN** 系统将任务标记为失败并显示"AI 服务未配置"及缺失项，不创建候选或 Entry，Source 保留且可重试
