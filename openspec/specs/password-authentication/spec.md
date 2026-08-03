## Purpose

定义 KnowStruct 已预置账号的密码登录、默认个人工作区、可撤销服务端会话、当前用户恢复、受保护访问和退出行为。

## Requirements

### Requirement: Operator-provisioned account and personal workspace

系统 MUST 提供仅供部署人员使用的命令行方式创建已有账号。创建成功时，系统 SHALL 在同一事务中创建唯一账号及其默认个人工作区；不得通过产品界面提供注册入口。

#### Scenario: Provision a new account
- **WHEN** 部署人员输入未使用的账号标识和符合要求的密码创建账号
- **THEN** 系统创建用户及一个名为“我的工作区”的默认个人工作区，且不输出或记录明文密码

#### Scenario: Reject a duplicate account
- **WHEN** 部署人员尝试创建规范化后已经存在的账号标识
- **THEN** 系统拒绝操作，并且不创建额外用户或孤立工作区

#### Scenario: Reject a password outside the accepted length
- **WHEN** 部署人员输入少于 12 个或多于 128 个字符的密码
- **THEN** 系统拒绝创建或重设密码，并且不写入部分账号数据

### Requirement: Responsive password login form

系统 SHALL 在桌面和移动视口提供同一套响应式登录能力，包含账号、密码、“保持登录”和登录操作；系统 MUST NOT 展示注册、找回密码或第三方登录入口。

#### Scenario: Required values are missing
- **WHEN** 用户在账号或密码为空时提交登录表单
- **THEN** 系统在表单内提示必填项，不发送认证请求，并保留用户已经输入的账号

#### Scenario: Login is being submitted
- **WHEN** 一个登录请求仍在处理中
- **THEN** 系统显示处理中状态并阻止重复提交

### Requirement: Authenticate an existing account

系统 SHALL 使用规范化后的账号标识查找已有账号，并使用安全密码哈希验证完整的密码输入。认证失败时，系统 MUST 使用不暴露账号是否存在的统一错误。

#### Scenario: Credentials are valid
- **WHEN** 用户提交正确的已有账号和密码
- **THEN** 系统建立新会话，返回当前用户及其默认个人工作区，并进入项目列表或安全的原目标业务页面

#### Scenario: Credentials are invalid
- **WHEN** 用户提交不存在的账号或错误密码
- **THEN** 系统不建立会话，并显示统一的“账号或密码错误”提示

### Requirement: Revocable server-side session

系统 MUST 使用浏览器 HttpOnly Cookie 承载随机会话凭据，并在服务端持久化可过期、可撤销的会话。原始会话凭据 MUST NOT 持久化到数据库或暴露给前端脚本。

#### Scenario: Login without remember-me
- **WHEN** 用户未勾选“保持登录”并成功登录
- **THEN** 系统设置不含持久化有效期的浏览器会话 Cookie，且服务端会话最迟在创建后 24 小时失效

#### Scenario: Login with remember-me
- **WHEN** 用户勾选“保持登录”并成功登录
- **THEN** 系统设置固定 30 天有效的持久 Cookie 和服务端会话，普通访问不得无限延长该期限

#### Scenario: Expired or revoked session is used
- **WHEN** 请求携带已过期、已撤销或无法匹配的会话凭据
- **THEN** 系统将请求视为未认证，并清除无效 Cookie

### Requirement: Restore the current user safely

系统 SHALL 提供当前用户查询能力，使前端在首次加载和页面刷新时恢复认证状态；认证检查完成前，系统 MUST NOT 短暂展示受保护内容。

#### Scenario: Restore a valid session
- **WHEN** 应用启动并携带有效会话 Cookie
- **THEN** 系统恢复当前用户和默认个人工作区，并显示请求的受保护页面

#### Scenario: Open a protected route without a session
- **WHEN** 未认证用户直接访问业务路由
- **THEN** 系统跳转登录页并保存站内原目标，成功登录后返回该目标

#### Scenario: Authenticated user opens the login route
- **WHEN** 已认证用户访问登录页
- **THEN** 系统将用户重定向到项目列表

### Requirement: Protect non-public APIs

除健康检查和认证建立所需端点外，业务 API MUST 要求有效会话，并通过统一的当前用户依赖提供用户和工作区边界。

#### Scenario: Call a protected API without authentication
- **WHEN** 请求在没有有效会话的情况下访问受保护 API
- **THEN** 系统返回 `401 Unauthorized`，且不执行任何业务操作

#### Scenario: Call a protected API with authentication
- **WHEN** 请求携带有效会话访问受保护 API
- **THEN** 系统向处理逻辑提供当前用户和默认个人工作区上下文

### Requirement: Logout the current session

系统 SHALL 允许用户退出当前设备会话。退出操作 MUST 撤销服务端会话并清除浏览器 Cookie，且重复退出不得产生错误或恢复会话。

#### Scenario: Logout from an authenticated session
- **WHEN** 已认证用户执行退出
- **THEN** 系统撤销当前会话、清除 Cookie 并返回登录页，原凭据不能再次访问受保护 API

#### Scenario: Logout without a valid session
- **WHEN** 用户在会话已失效或 Cookie 缺失时执行退出
- **THEN** 系统仍清除认证 Cookie 并返回成功结果

### Requirement: Operator password reset

系统 SHALL 提供部署人员命令行重设账号密码的能力，作为 P0 无用户自助找回密码时的恢复手段。重设成功 MUST 撤销该账号的全部现有会话。

#### Scenario: Reset an existing account password
- **WHEN** 部署人员为已有账号输入并确认新密码
- **THEN** 系统更新密码哈希、撤销该账号全部会话，并且不输出或记录明文密码

### Requirement: Browser session security

系统 MUST 使用安全 Cookie 属性保护认证凭据，并对使用 Cookie 认证的非安全方法校验可信来源。生产配置 MUST 拒绝不安全 Cookie 或空可信来源设置，登录端点 MUST 提供可配置的请求限流。

#### Scenario: Issue a production session Cookie
- **WHEN** 生产环境成功建立登录会话
- **THEN** Cookie 包含 `HttpOnly`、`Secure` 和 `SameSite=Lax`，并限制到所需路径

#### Scenario: Receive an unsafe cross-origin request
- **WHEN** Cookie 认证请求使用非安全 HTTP 方法且 `Origin` 不在可信来源列表
- **THEN** 系统拒绝请求且不执行状态变更

#### Scenario: Exceed the login request limit
- **WHEN** 同一客户端在一分钟内提交超过默认 10 次登录请求
- **THEN** 系统返回限流响应且不继续执行密码验证
