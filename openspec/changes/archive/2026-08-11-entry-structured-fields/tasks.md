## 1. AI 提示词与解析

- [x] 1.1 `CANDIDATE_SYSTEM_PROMPT` 增加 `key_params`（可选、dict[str,str]、有可提取参数
  才输出、禁止编造）与 `risk_points` 质量规则（只写具体/非显而易见/针对本条内容的要点，
  禁止「不同品牌要求不同」类套话，无要点省略）
- [x] 1.2 `_CandidateModel` 与 `parse_candidate_items` 校验并透传 `key_params`
  （非对象/值非字符串/超限按无效 AI 输出处理），不再硬编码 None
- [x] 1.3 demo Provider 为参数/避坑类候选补充确定性 `key_params`/`risk_points` 示例

## 2. 数据模型与迁移

- [x] 2.1 `Entry` 模型增加 `key_params`（JSON）、`risk_points`（JSON）列
- [x] 2.2 迁移 0019：新增两列并从关联 Extraction 回填历史 `risk_points`
  （key_params 历史为空），真实 MySQL 验证回填与查询
- [x] 2.3 `ExtractionResponse` 与前端 `Extraction` 类型增加 `key_params`

## 3. 确认与归档服务

- [x] 3.1 `DecideRequest` 增加 `key_params`/`risk_points` 及校验，`decide_extraction`
  落库（未提交时继承候选现值）
- [x] 3.2 `batch_confirm_sources` 创建 Entry 时携带候选的 `key_params`/`risk_points`
- [x] 3.3 `NodeEntryResponse`/`EntryUpdate` 增加两字段，列表与更新服务透传

## 4. 前端实现

- [x] 4.1 确认页候选卡片：字段非空时按需展示可编辑多行文本框（风险点每行一条；
  关键参数每行「键：值」），解析失败给出可读错误并保留输入
- [x] 4.2 记录卡片（桌面与移动）在字段非空时展示「关键参数/避坑要点」区块
- [x] 4.3 `EntryEditDialog` 增加两个可编辑文本域（可为空）并随保存提交
- [x] 4.4 前端类型（`Extraction`/`DecideInput`/`NodeEntry`/`EntryUpdateInput`）更新

## 5. 自动化测试

- [x] 5.1 后端：key_params 解析校验与透传、逐条确认落库与编辑覆盖、批量确认继承、
  Entry 编辑与清空、迁移回填
- [x] 5.2 前端：确认页展示/编辑/空不展示、记录展示与编辑
- [x] 5.3 全量验证：`cd backend && .venv/bin/pytest -q && .venv/bin/ruff check .`；
  `cd frontend && npm test -- --run && npm run lint && npm run build`；
  `openspec validate --all --strict`

## 6. 真实验收与文档

- [x] 6.1 浏览器验收（桌面 1440 + 移动 390，demo 账号确定性数据）：参数类候选确认页
  展示可编辑字段，接受后记录详情/列表展示，无字段候选不展示区块，移动端无横向溢出
- [x] 6.2 同步 delta spec 到 `extraction-confirmation`/`entry-maintenance`/
  `batch-confirm-candidates` 主规格并归档本 change
- [x] 6.3 提交到 `codex/entry-structured-fields` 分支，不推送、不合并
