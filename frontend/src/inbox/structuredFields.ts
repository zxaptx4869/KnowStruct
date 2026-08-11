/** 关键参数 / 避坑要点的多行文本与结构化数据互转。 */

export function formatKeyParams(
  params: Record<string, string> | null | undefined,
): string {
  if (!params) return ''
  return Object.entries(params)
    .map(([key, value]) => `${key}：${value}`)
    .join('\n')
}

export function parseKeyParams(
  text: string,
): { value: Record<string, string> } | { error: string } {
  const value: Record<string, string> = {}
  const lines = text.split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim()
    if (!line) continue
    const separator = line.indexOf('：') >= 0
      ? line.indexOf('：')
      : line.indexOf(':')
    if (separator < 0) {
      return { error: `第 ${index + 1} 行缺少「：」分隔符` }
    }
    const key = line.slice(0, separator).trim()
    const item = line.slice(separator + 1).trim()
    if (!key) {
      return { error: `第 ${index + 1} 行参数名为空` }
    }
    value[key] = item
  }
  return { value }
}

export function formatRiskPoints(
  points: string[] | null | undefined,
): string {
  return (points ?? []).join('\n')
}

export function parseRiskPoints(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}
