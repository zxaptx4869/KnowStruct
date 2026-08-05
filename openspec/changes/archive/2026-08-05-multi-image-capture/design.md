## Context

当前图片采集是单附件模型：`sources` 上直接挂 `attachment_object_key / filename / content_type / size`，前端选图即自动上传并立即入队，没有独立提交动作。文字 / 链接的按钮是"保存原始来源"。本切片把图片升级为"一条最多 3 张、客户端攒选、点一次开始提取批量入队"，并把三种方式的提交按钮统一为"开始提取"。

## Goals / Non-Goals

**Goals:**

- 一条图片采集最多 3 张，附件落在子表，原单图数据平滑迁移。
- 客户端攒选（相册多选 / 拍照追加 / 可移除）→ 点"开始提取"一次性原子提交。
- OCR 循环识别全部附件并合并正文，失败整条重试；送审前压缩副本降本提速。
- 文字 / 链接 / 图片按钮统一为"开始提取"，文字 / 链接行为不变。

**Non-Goals:**

- 不做服务端"待开始"任务状态（攒选在客户端完成，一次提交即入队）。
- 不做开始后追加 / 移除图片（请求一次性的，开始即锁定）。
- 不做单张单独重试、不做压缩档位配置 UI（先固定 2048px / quality 80）。

## Decisions

### D1: 附件子表与迁移（0005）

- 新增 `source_attachments`：`id`、`source_id`（FK cascade）、`workspace_id`（FK cascade）、`object_key`、`filename`、`content_type`、`size`、`sort_order`、时间戳；索引 `(source_id, sort_order)`、`(workspace_id)`。
- `sources` 上 4 个单附件列在迁移中删除；现有单图数据按 `sort_order=0` 回填进子表后再删列。downgrade 恢复单列（取 sort_order 最小的一张）并回填。
- API 响应：`attachments: []`（按 sort_order），并保留兼容字段 `attachment`（= 首图），前端旧调用不破坏。

### D2: 批量上传与原子性

- `POST /api/inbox/sources/image` 改为 `files: list[UploadFile]`：单张仍执行大小 / MIME / 可解析 / 4096px 校验；总张数 ≤3。
- 任一张校验失败 → 422，不创建 Source、不写任何文件；成功才建 Source → 逐张落盘（`sort_order` 按提交顺序）→ `content_status=saved` → 创建 `ocr` 阶段 `pending` 任务。落盘中途失败清理已写文件并回滚。

### D3: OCR 循环与合并正文

- `process_source_ocr` 按 `sort_order` 遍历附件，每张调用 `run_ocr_with_fallback`；某张抛错或空文本 → 整条失败，错误信息标注"第 N 张"，任务停留在 `ocr` 阶段可重试。
- 正文按 `图 {n}：\n{ocr_text}` 拼接写入 `source.content`（n 从 1 开始），重试时整批重新识别并覆盖（幂等，不产生重复候选）。
- 附件读取端点增加 `GET /api/inbox/sources/{source_id}/attachments/{attachment_id}`（Workspace 归属校验）；旧 `/attachment` 端点保留并返回首图，兼容存量。

### D4: 送审压缩副本

- 新增 `prepare_ocr_image(data: bytes) -> bytes`：Pillow 打开，最长边 >2048 等比缩小；按原格式重编码（JPEG/WebP `quality=80`，PNG 用 optimize），仅在需要时缩放。
- OCR 调用使用副本；原图完整落盘用于预览与存档。压缩收益随 token 计费模型（图片按分辨率折算 token）而非线性，2048px 为平衡点，验收时可用真实截图对照。

### D5: 前端统一"开始提取"

- 文字 / 链接：按钮文案由"保存原始来源"改为"开始提取"，提交逻辑不变（保存 Source 并立即入队）。
- 图片：移除"选图即上传"；`selectedFiles: File[]`（≤3）：相册 `input[multiple]`、拍照 `input[capture]` 追加、可逐张移除、缩略图预览、计数提示"已选 n/3"；点"开始提取"构造 `FormData(files[])` 一次提交，成功跳详情，失败保留所选与项目选择。
- 详情页 SourcePane 渲染附件缩略图条（横向滚动），点击可放大查看原图。

## Risks / Trade-offs

- [迁移删除 `sources.attachment_*` 列影响旧代码] → API 层保留 `attachment` 首图兼容字段；迁移测试覆盖 upgrade / downgrade 与回填。
- [批量原子性与文件清理] → 上传接口先全量校验再落盘；落盘异常清理已写文件并回滚事务。
- [压缩过度导致小字糊] → 固定 2048px / quality 80，验收用真实截图对照；OCR 失败路径保留可重试。
- [移动端多选兼容性] → `<input type="file" multiple accept="image/*">` 在主流移动浏览器可用；拍照每次一张、可继续追加；390px 验收覆盖。
- [OCR token 成本非线性] → 压缩降本但非零；3 张上限 + 2048px 副本约束单次成本上限。

## Migration Plan

- `alembic upgrade head` 执行 0005：建 `source_attachments` → 回填现有单图 → 删 `sources.attachment_*`；downgrade 恢复单列并回填首图。旧数据（text / link / image）均不受影响。
- 部署顺序：后端（含迁移）先上，前端再上；本地附件目录结构不变（`{workspace}/{source}/{key}`）。
