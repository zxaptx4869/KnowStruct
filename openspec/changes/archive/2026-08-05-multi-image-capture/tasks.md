## 1. 数据模型与迁移

- [x] 1.1 新增 SourceAttachment 模型（source_id / workspace_id / object_key / filename / content_type / size / sort_order），并更新模型导出
- [x] 1.2 编写 alembic 0005：建表 → 回填现有单图 → 删除 sources.attachment_* 列；downgrade 恢复单列并回填首图
- [x] 1.3 迁移测试：upgrade/downgrade、单图回填与首图恢复

## 2. 批量上传与附件访问

- [x] 2.1 上传接口改为 files[]（≤3 张），逐张校验（大小 / MIME / 尺寸 / 可解析），任一失败整批 422 且不建 Source
- [x] 2.2 create_image_source 批量落盘：建 Source → 按序写文件 → saved → 创建 ocr 任务；失败清理已写文件
- [x] 2.3 附件读取端点支持按 attachment_id 访问，保留首图旧端点兼容
- [x] 2.4 响应模型：attachments[]（按 sort_order）+ 兼容 attachment 首图字段

## 3. OCR 循环与压缩副本

- [x] 3.1 prepare_ocr_image：最长边 >2048 等比缩小，原格式 quality 80 重编码；原图不动
- [x] 3.2 process_source_ocr 遍历附件，按"图 N"合并正文；单张失败整条失败并标注第几张
- [x] 3.3 后端单测：多图 OCR 合并 / 单张失败 / 整批重试不重传 / 压缩副本与原图分离 / 并发重试

## 4. 前端多图采集与统一按钮

- [x] 4.1 图片模式改为客户端攒选：相册多选、拍照追加、缩略图预览、逐张移除、3 张上限提示
- [x] 4.2 三种方式提交按钮统一为"开始提取"；图片点击后 FormData(files[]) 一次性提交
- [x] 4.3 详情页 SourcePane 多图缩略图条，点击查看原图
- [x] 4.4 更新前端类型与测试（InboxPage、SourceConfirmPage），补充 390px 多选验收用例

## 5. 验证与真实验收

- [x] 5.1 后端全量：cd backend && .venv/bin/pytest -q && .venv/bin/ruff check .
- [x] 5.2 前端全量：cd frontend && npm test -- --run && npm run lint && npm run build
- [x] 5.3 openspec validate --all --strict
- [x] 5.4 MySQL 冒烟：0005 迁移、3 张批量上传 → 合并 OCR → 候选确认全链路、单张失败重试
- [x] 5.5 浏览器验收：桌面多选 3 张 / 移除 / 开始提取；移动 390px 相册多选与拍照追加；详情多图预览

## 6. 收尾

- [x] 6.1 更新 docs/tech-stack.md（附件子表与压缩策略）与变更记录
- [ ] 6.2 同步主规格（openspec sync）并校验
- [ ] 6.3 归档 change 并提交分支
