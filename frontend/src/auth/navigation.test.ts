import { describe, expect, it } from 'vitest'
import { safeReturnPath } from './navigation'

describe('safeReturnPath', () => {
  it('keeps internal paths', () => {
    expect(safeReturnPath('/projects/one?tab=tree')).toBe('/projects/one?tab=tree')
  })

  it('rejects external and protocol-relative targets', () => {
    expect(safeReturnPath('https://attacker.example')).toBe('/')
    expect(safeReturnPath('//attacker.example')).toBe('/')
    expect(safeReturnPath(undefined)).toBe('/')
  })
})
