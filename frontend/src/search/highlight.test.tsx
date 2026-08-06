import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { highlightText } from './highlight'

function marksOf(text: string, keyword: string) {
  const { container } = render(<div>{highlightText(text, keyword)}</div>)
  return Array.from(container.querySelectorAll('mark.search-highlight'))
}

describe('highlightText', () => {
  it('returns the text unchanged for a blank keyword', () => {
    const { container } = render(<div>{highlightText('零嵌冰箱', '   ')}</div>)
    expect(container.querySelector('mark')).toBeNull()
    expect(container.textContent).toBe('零嵌冰箱')
  })

  it('highlights every occurrence case-insensitively', () => {
    const marks = marksOf('Fridge left and fridge right', 'fridge')
    expect(marks.map((mark) => mark.textContent)).toEqual(['Fridge', 'fridge'])
  })

  it('keeps non-matching text intact', () => {
    const marks = marksOf('零嵌冰箱需要先确认散热方式', '冰箱')
    expect(marks.map((mark) => mark.textContent)).toEqual(['冰箱'])
  })

  it('treats wildcard-looking characters literally', () => {
    const marks = marksOf('面料 100%棉，型号 A_B', '100%棉')
    expect(marks.map((mark) => mark.textContent)).toEqual(['100%棉'])
    expect(marksOf('面料 100X棉', '100%棉').length).toBe(0)
  })

  it('returns the text unchanged when there is no match', () => {
    const { container } = render(<div>{highlightText('没有命中词', '冰箱')}</div>)
    expect(container.querySelector('mark')).toBeNull()
    expect(container.textContent).toBe('没有命中词')
  })
})
