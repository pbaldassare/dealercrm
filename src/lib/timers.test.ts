import { describe, expect, it } from 'vitest'
import { assignedEscalation, deadlineAt } from './timers'

describe('deadlineAt', () => {
  it('adds timer minutes', () => {
    const from = new Date('2026-10-20T09:00:00Z')
    expect(deadlineAt(from, 15)?.toISOString()).toBe('2026-10-20T09:15:00.000Z')
    expect(deadlineAt(from, null)).toBeNull()
  })
})

describe('assignedEscalation', () => {
  it('warns at 15/30 and reassigns at 60', () => {
    expect(assignedEscalation(10)).toBeNull()
    expect(assignedEscalation(15)).toBe('warn_salesperson')
    expect(assignedEscalation(30)).toBe('warn_manager')
    expect(assignedEscalation(60)).toBe('reassign')
  })
})
