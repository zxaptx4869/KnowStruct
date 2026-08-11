import { describe, expect, it } from 'vitest'
import {
  formatKeyParams,
  formatRiskPoints,
  parseKeyParams,
  parseRiskPoints,
} from './structuredFields'

describe('structuredFields', () => {
  it('formats and parses key params as one pair per line', () => {
    const params = { 散热方式: '底部散热', 安装余量: '左右各 2-5mm' }
    const text = formatKeyParams(params)
    expect(text).toBe('散热方式：底部散热\n安装余量：左右各 2-5mm')
    expect(parseKeyParams(text)).toEqual({ value: params })
  })

  it('accepts half-width colons and trims whitespace', () => {
    expect(parseKeyParams(' 型号 : M60 \n容量:10kg')).toEqual({
      value: { 型号: 'M60', 容量: '10kg' },
    })
  })

  it('keeps value text containing colons', () => {
    expect(parseKeyParams('说明：散热方式：底部散热')).toEqual({
      value: { 说明: '散热方式：底部散热' },
    })
  })

  it('reports a missing separator with the line number', () => {
    expect(parseKeyParams('散热方式\n容量：10kg')).toEqual({
      error: '第 1 行缺少「：」分隔符',
    })
  })

  it('formats and parses risk points as one item per line', () => {
    const points = ['散热方式不同，余量要求不同', '需以安装图为准']
    expect(formatRiskPoints(points)).toBe(
      '散热方式不同，余量要求不同\n需以安装图为准',
    )
    expect(parseRiskPoints(formatRiskPoints(points))).toEqual(points)
    expect(parseRiskPoints('  \n 条目一 \n  \n条目二 ')).toEqual(['条目一', '条目二'])
  })
})
