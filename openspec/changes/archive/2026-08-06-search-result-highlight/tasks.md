## 1. 前端高亮实现

- [x] 1.1 新增高亮工具函数（`escapeRegExp` + `highlightText`）：空词返回原文、大小写不敏感、正则特殊字符与 `%`/`_` 按字面匹配、多处命中全部高亮。
- [x] 1.2 在 `SearchPage.tsx` 应用高亮：Entry 标题与内容、Source 标题与摘要（`content ?? link_url`），使用防抖后的关键词。
- [x] 1.3 在 `frontend/src/index.css` 增加 `.search-highlight` 主题色样式，不改变行内布局与 line-clamp 截断。

## 2. 测试

- [x] 2.1 在 `SearchPage.test.tsx` 与新增的 `highlight.test.tsx` 增加高亮断言：命中词渲染为 `<mark>`、大小写不敏感、`%`/`_` 字面高亮、无命中与空词不高亮。

## 3. 验证、同步与归档

- [x] 3.1 前端全量验证：`cd frontend && npm test -- --run && npm run lint && npm run build`。
- [x] 3.2 浏览器真实验收（桌面与 390px）：搜索结果命中词以主题色高亮，无命中时不高亮。
- [x] 3.3 OpenSpec 校验：`openspec validate --all --strict`。
- [x] 3.4 同步主规格（sync-specs）、归档 Change（archive），在当前分支提交；合并 main 前等用户确认。
