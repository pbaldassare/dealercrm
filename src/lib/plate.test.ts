import { describe, expect, it } from 'vitest'
import { isValidItalianPlate, normalizePlate } from './plate'

describe('normalizePlate', () => {
  it('uppercases and strips spaces', () => {
    expect(normalizePlate('zz 101 aa')).toBe('ZZ101AA')
  })
})

describe('isValidItalianPlate', () => {
  it('accepts current Italian plates', () => {
    expect(isValidItalianPlate('ZZ101AA')).toBe(true)
  })

  it('rejects empty or malformed plates', () => {
    expect(isValidItalianPlate('')).toBe(false)
    expect(isValidItalianPlate('AB1234')).toBe(false)
  })
})
