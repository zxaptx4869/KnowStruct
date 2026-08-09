## Why

项目记录整理模式（桌面端）记录较多时，只能靠节点/类型筛选，找不到目标记录的成本高。本 Change 为项目记录列表增加关键词查询：用户输入关键词即可按标题/内容检索记录，快速定位并继续批量整理。

## What Changes

- 后端 `GET /projects/{id}/entries` 新增可选 `q` 参数：去除首尾空白后按标题/内容 LIKE 匹配，`%`、`_`、`\` 按字面处理，超过 100 字符拒绝；空关键词不产生过滤。
- 响应新增 `matched_count`：与记录总数 `total` 分离返回，搜索激活时前端展示「共 N 条 · 匹配 M 条」。
- 前端项目整理模式（桌面端）新增搜索输入框、搜索与清除按钮；搜索激活时标题切换为「搜索记录」并显示匹配数。
- 移动端不显示搜索框；批量工具栏在移动端视口通过 CSS 隐藏（与既有「移动端无多选批量」行为一致）。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `entry-maintenance`: 项目级记录聚合查询新增关键词查询与匹配数返回；整理模式新增桌面端搜索交互。

## Impact

- 后端：`backend/app/services/entries.py`（q 过滤与 matched_count 统计）、`backend/app/schemas/projects.py`（响应字段）、`backend/app/api/projects.py`（查询参数）。
- 前端：`frontend/src/projects/queries.ts`（q 参数与查询键）、`frontend/src/pages/ProjectDetailPage.tsx`（搜索框与头部计数）、`frontend/src/projects/types.ts`、`frontend/src/index.css`（移动端隐藏批量工具栏）。
- 测试：后端 `test_project_records.py` 新增关键词/通配符/空词/匹配数用例；前端 `ProjectDetailPage.test.tsx` 新增搜索、清除、无匹配空态用例。
- 无数据库迁移。Appetite：小。
