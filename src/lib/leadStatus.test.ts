import { describe, expect, it } from 'vitest'
import { canChangeLeadStatus, mockQualify, remainingTone } from './leadStatus'

describe('canChangeLeadStatus', () => {
  it('allows spec transitions and blocks others', () => {
    expect(canChangeLeadStatus('new', 'ai_qualifying')).toBe(true)
    expect(canChangeLeadStatus('qualified', 'assigned')).toBe(true)
    expect(canChangeLeadStatus('new', 'won')).toBe(false)
    expect(canChangeLeadStatus('won', 'lost')).toBe(false)
  })
})

describe('remainingTone', () => {
  it('turns orange under 25% and red when overdue', () => {
    expect(remainingTone(10, 1)).toBe('orange')
    expect(remainingTone(-5, 15)).toBe('red')
    expect(remainingTone(800, 15)).toBe('green')
  })
})

describe('mockQualify', () => {
  it('scores a simple availability question as hot', () => {
    expect(mockQualify('La Audi A3 è ancora disponibile?').score).toBe(80)
  })
})
