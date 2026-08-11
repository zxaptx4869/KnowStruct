## Context

KnowStruct 的归档链路目前是纯手工：采集时项目可选不选；确认候选时必须手动翻节点下拉；
AI 提取候选虽带 `suggested_node_path`，但它是无目录上下文的自由文本，只做纯文本展示。
C7 已建立「现有目录树注入 + 路径容错解析」的经验，本需求将其延伸到采集/提取/确认三环节：
未选项目时由 AI 轻量推荐项目（带置信度），提取时注入该项目目录生成节点建议，确认时
解析建议路径（预选或显式新建），低置信度一律降级为手动并给说明。

现状约束：
- 采集接口：`POST /sources`（文本/链接，payload 含可选 `project_id`）、
  `POST /sources/image`（form 含可选 `project_id`，图片内容在 OCR 前不可读）。
- `Source.project_id` 可空；提取候选持久化于 `Extraction`，含 `suggested_node_path`（文本）。
- 提取调用链：`process_source_extraction` → provider `extract_candidates(content, content_type)`
  → `request_json_candidates`（无目录上下文）。
- 确认候选接口要求项目必选、节点可空且必须属于所选项目；节点创建/校验复用 `create_node`。
- 批量确认（`BatchConfirmDialog`）使用统一归档节点，本轮不改。

## Goals / Non-Goals

**Goals:**
- 未选项目时，采集提交后尽快给出可修改的「AI 建议归档项目」（含置信度与理由）。
- 提取候选时若项目已定（用户所选或 AI 推荐），注入该项目目录路径清单，模型输出目录内
  的节点建议路径并给出建议置信度。
- 逐条确认时：全匹配预选并标注「AI 建议」；部分匹配提供显式「新建缺失段」入口；
  低置信度或目录变化时降级为手动选择并给出说明。
- AI 建议永不自动归档：项目、节点、新建节点都必须用户确认。

**Non-Goals:**
- 不做批量确认的逐条建议（保持统一归档节点）。
- 不做阈值配置 UI（0.6 写死，后续再开放）。
- 不改变提取/确认的既有事务与重试语义；不引入新的 AI 模型策略。
- 不做「自动把项目分配给 Source」的静默行为——推荐仅展示与供提取上下文使用。

## Decisions

### D1：项目推荐轻量调用，采集时同步（文本/链接），图片在 OCR 后补调

- 文本/链接 Source：`source_create` 内若未选项目且项目数 >1，同步调用
  `recommend_project(项目列表, 内容)`，结果存入 Source 并随详情返回。
- 图片 Source：采集时无文本，OCR 完成后在提取处理流程内补调一次推荐（输入 OCR 文本），
  推荐结果落库；UI 在处理完成后显示。
- 项目数 ≤1 时不调用（唯一项目直接作为推荐）。
- 推荐失败/超时 MUST 静默降级（Source 无推荐字段，确认时手动），不阻塞采集与提取。

**备选**：只在提取任务内串行推荐+提取。不选：采集页无法立即展示建议，且图片/文本路径
行为不一致；同步推荐成本很低（项目列表仅名称/背景）。

### D2：Source 与 Extraction 落库推荐结果

- `sources` 新增：`recommended_project_id`（FK `projects.id` ON DELETE SET NULL）、
  `recommended_confidence`（Float NULL）、`recommended_reason`（String(500) NULL）、
  `recommended_at`（DateTime NULL）。
- `extractions` 新增：`suggested_node_confidence`（Float NULL）。
- 用户后续手动选择项目不覆盖推荐字段（仅 `project_id` 生效）；推荐字段仅用于展示与
  提取上下文选择。

### D3：AI 接口扩展：项目推荐 + 目录感知提取

- 新增 `AIProvider.recommend_project(projects, content)`，返回
  `ProjectRecommendation(project_id, confidence, reason)`；openai_compat 实现
  `request_json_project_recommendation`，demo 提供确定性实现（项目名/背景关键词匹配）。
- `extract_candidates(content, content_type, directory_paths=None)`：非空时在 user 消息
  追加「现有目录：」路径清单（由项目目录树序列化，限长）；`CANDIDATE_SYSTEM_PROMPT`
  要求 `suggested_node_path` 取自现有目录或标注「建议新建：」，并输出
  `suggested_node_confidence`。
- 提取时目录查询失败/为空 → 不带目录降级（与现状一致）。

### D4：确认时路径解析放前端，新建走既有节点接口

- 前端在用户选项目后用 `useNodes` 数据解析 `suggested_node_path`：
  - 全匹配（逐段标准化名称，末段唯一宽容）→ 节点下拉预选 + 「AI 建议」标注；
  - 部分匹配 → 显示「建议新建：缺失段（父：已匹配前缀）」，下拉提供「新建该节点」选项；
  - 低置信度（<0.6）或不匹配 → 不预选，提示手动选择；
  - 解析逻辑抽成工具函数并测试（复用 C7 的标准化/唯一匹配经验）。
- 「新建」点击后调用现有 `POST /projects/{id}/nodes` 沿路径创建缺失段（父节点取已匹配
  前缀末节点），成功后自动作为该候选归档节点；失败（重名/超深/归属）显示错误可改选。
- 目录在提取后变化导致匹配不上 → 走「建议新建/手动」分支，不阻塞确认。

**备选**：后端提供路径解析接口。不选：前端已有目录数据，解析是纯函数，减少往返；
新建本就复用既有接口，事务边界清晰（节点先建、Entry 确认是独立操作）。

### D5：UI 形态

- 采集页：项目下拉旁小字提示「不选择时 AI 将推荐归档项目」；推荐成功后在该项目下拉
  附近显示「AI 建议归档：X（置信度，理由）」，提供「使用」/「忽略」；图片 Source 在处理
  完成后同位置展示。
- 逐条确认（`SourceConfirmPage`）：候选卡片节点下拉预选并标注「AI 建议」；「建议新建」
  选项点击后创建并选中；低置信度显示说明文本。桌面与 390px 移动端一致。
- `BatchConfirmDialog` 不改。

## Risks / Trade-offs

- [同步推荐增加采集请求耗时几秒] → 推荐调用带超时与容错；失败静默降级，不阻塞采集。
- [图片推荐在 OCR 后，用户等待期间无建议] → 处理完成后自动刷新展示，与现有提取状态
  刷新机制一致。
- [AI 建议路径与目录命名不一致导致匹配失败] → 提取提示词要求取自目录 + 容错匹配；
  失败走「建议新建/手动」分支，不影响确认。
- [用户所选项目与 AI 推荐不同] → 用户选择始终优先；推荐只用于展示与提取上下文。
- [新增推荐字段增加提取/采集 payload] → 字段可空、限长，向后兼容；旧数据无推荐字段时
  走手动降级。

## Migration Plan

1. Alembic 迁移：`sources` 加推荐字段（FK SET NULL + 索引），`extractions` 加
   `suggested_node_confidence`；SQLite 批量模式 + 真实 MySQL 验证；回滚仅删列。
2. 发布顺序：先合并后端迁移与接口（旧前端忽略新字段），再部署前端（新字段缺失时
  按无推荐处理）。
