## Why

搜索页当前采用防抖自动搜索，输入过程中的输入法拼音与中途提交词会被真实搜索并写入最近搜索历史（如输入"洗碗机"会留下 `xiwanji`、`洗碗` 等碎片），体验差且浪费请求。同时历史列表逐行展示占用空间大。改为显式提交触发搜索，并把历史改为按内容宽度自适应的标签流（类似小红书），更贴近移动端操作习惯与主流搜索产品形态。

## What Changes

- 移除防抖自动搜索：搜索 SHALL 仅在用户点击"搜索"按钮或按回车（输入法非组合状态）时触发；输入内容变化 MUST 不自动发起请求。
- 回车触发搜索 SHALL 忽略输入法组合状态中的回车（`isComposing`），避免选词回车把拼音提交为搜索词。
- URL `?q=` 在提交时同步；带 `?q=` 打开页面 SHALL 自动执行一次搜索（深链语义），且按现有规则记录。
- 搜索结果展示后用户编辑输入框但未提交时 SHALL 保留上一次结果与 URL 关键词；清空输入框时回到空态（引导或最近搜索）。
- 空关键词提交 SHALL 显示提示且不发起请求。
- 最近搜索历史 SHALL 以按内容宽度自适应的标签流展示（每个标签含关键词按钮与独立删除按钮），区块标题保留"清空"；输入框非空时隐藏历史区块。
- 记录语义不变：搜索成功（含无结果）记录、失败不记录、同一关键词去重置顶、最多 8 条、按用户隔离 localStorage。

## Capabilities

### New Capabilities

### Modified Capabilities
- `search-and-trace-source`: 新增"搜索由显式提交触发"需求（提交按钮/回车、组合状态回车忽略、编辑保留旧结果、空提交提示）。
- `recent-search-history`: 新增"历史以标签流展示"需求（自适应宽度铺开、独立删除、移动端不溢出）。

## Impact

- 前端：`frontend/src/pages/SearchPage.tsx`（提交交互与标签流渲染）、`frontend/src/index.css`（标签流样式）、`frontend/src/pages/SearchPage.test.tsx`（交互重写与新增场景）。
- 后端：无接口、无数据模型、无迁移改动。
- 主规格：实现后同步 `search-and-trace-source` 与 `recent-search-history` 两份主规格。
