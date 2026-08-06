## Context

搜索页已实现：`?q=` URL 同步、300ms 防抖、Entry 结果（类型徽标、标题、内容摘要、路径、来源标签）与 Source 命中（类型、标题、摘要、关联记录数）卡片。后端返回完整 title/content/link_url，前端用 CSS 行数截断展示。本 Change 仅在前端为命中词加主题色高亮，不改后端。

## Goals / Non-Goals

**Goals:**
- Entry 标题与内容、Source 标题与正文（无正文时链接）中的命中词以主题色高亮。
- 大小写不敏感，多处命中全部高亮；随关键词实时更新；无命中或空词不高亮。

**Non-Goals:**
- 不修改后端接口与返回结构，不计算命中位置。
- 不对节点路径、来源小标签、统计文字做高亮。
- 不支持多关键词拆分、词形还原、语义高亮（P2）。
- 不在 OCR 原图内定位高亮区域。

## Decisions

### 1. 纯前端子串高亮

新增工具函数 `highlightText(text, keyword)`：

```ts
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function highlightText(text: string, keyword: string) {
  const trimmed = keyword.trim()
  if (!trimmed) return text
  const pattern = new RegExp(`(${escapeRegExp(trimmed)})`, 'gi')
  return text.split(pattern).map((part, index) =>
    index % 2 === 1
      ? <mark key={index} className="search-highlight">{part}</mark>
      : part,
  )
}
```

- 用带捕获组的 `split` 让奇偶索引天然对应命中片段，React 自动转义文本，无 XSS 风险。
- `gi` 标志实现大小写不敏感，与后端 MySQL `utf8mb4_*_ci` 的 LIKE 行为一致。
- 理由：改动最小、实时性好、无额外请求；后端返回完整文本，前端即可定位。
- 备选：后端返回命中位置（如 `<mark>` 或位置数组）——增加接口复杂度且前端仍需渲染逻辑，P0 不需要，否决。

### 2. 应用范围

- Entry 卡片：`entry.title`、`entry.content`。
- Source 卡片：`source.title`、摘要（`content ?? link_url ?? '（无正文）'`）。
- 使用的关键词为防抖后的 `keyword`（与已展示结果一致），而非输入框瞬时值，避免高亮与结果错位。

### 3. 高亮样式

`.search-highlight` 使用主题色：浅色背景（`--color-primary-soft` 或相近的 10% 透明主题色）+ 主题色文字，并保留行内布局；不改变现有 line-clamp 截断行为。

## Risks / Trade-offs

- [正则特殊字符误匹配] → `escapeRegExp` 先转义，`%`、`_` 等按字面匹配（与后端 LIKE 转义一致）。
- [大小写行为与数据库极端不一致] → P0 中文内容为主、无大小写概念；拉丁字符两端均为不敏感匹配，风险可忽略。
- [高亮样式影响可读性] → 仅对命中片段加淡背景，不改变字号与行高，并在浏览器验收中检查对比度与 390px 布局。

## Migration Plan

- 无后端改动、无迁移；前端随搜索页一起发布，回滚即回退该提交。

## Open Questions

- 无。
