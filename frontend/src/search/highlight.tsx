import type { ReactNode } from 'react'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 将文本中按字面匹配（大小写不敏感）的关键词片段渲染为主题色高亮。
 * 空关键词或无命中时原样返回文本，不产生高亮标记。
 */
export function highlightText(text: string, keyword: string): ReactNode {
  const trimmed = keyword.trim()
  if (!trimmed) return text
  const pattern = new RegExp(`(${escapeRegExp(trimmed)})`, 'gi')
  return text.split(pattern).map((part, index) =>
    index % 2 === 1
      ? <mark key={index} className="search-highlight">{part}</mark>
      : part,
  )
}
