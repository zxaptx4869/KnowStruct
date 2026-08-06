## Why

搜索页已能返回 Entry 与 Source 结果，但结果中看不到关键词命中的具体位置，用户需要快速定位"为什么这条结果命中"。把命中词以主题色高亮展示，能显著降低扫描成本（对应功能结构 P1 的 G5 关键词高亮，本次明确纳入）。

## What Changes

- 在搜索页结果卡片中，用主题色高亮命中的关键词：
  - Entry 结果：标题与内容摘要中的命中词高亮。
  - Source 命中：标题与正文摘要（无正文时对链接）中的命中词高亮。
  - 大小写不敏感（与后端 `LIKE` 的 ci 排序规则一致）；同一关键词多处出现全部高亮。
- 纯前端实现，使用搜索页当前的防抖关键词做子串匹配，不修改后端接口、数据模型或现有搜索行为。
- 高亮随关键词实时变化：空词或当前结果中无命中时不高亮；`%`、`_` 等特殊字符按字面匹配高亮。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `search-and-trace-source`: 在"搜索页交互状态"需求中新增命中词高亮的行为要求。

## Impact

- 前端：`frontend/src/pages/SearchPage.tsx` 增加高亮渲染（`<mark>` + 主题色样式），`frontend/src/index.css` 增加高亮样式类，可能新增小型高亮工具函数。
- 测试：`frontend/src/pages/SearchPage.test.tsx` 增加高亮断言（命中词出现、大小写不敏感、特殊字符字面高亮、无命中不高亮）。
- 后端与 OpenSpec 主规格：后端无改动；主规格 `search-and-trace-source` 增加一条需求场景。
