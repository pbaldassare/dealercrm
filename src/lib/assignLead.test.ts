import { describe, expect, it } from 'vitest'
import { pickAssignee, priceBand, type Candidate } from './assignLead'

const people: Candidate[] = [
  { id: 'marco', closeRate: 0.22, avgResponseMin: 6, received30: 18, openLeads: 9, appointmentsRate: 0.4 },
  { id: 'giulia', closeRate: 0.27, avgResponseMin: 4, received30: 16, openLeads: 11, appointmentsRate: 0.5 },
  { id: 'luca', closeRate: 0.18, avgResponseMin: 11, received30: 20, openLeads: 12, appointmentsRate: 0.3 },
  { id: 'sara', closeRate: 0.25, avgResponseMin: 7, received30: 14, openLeads: 8, appointmentsRate: 0.45 },
]

const weights = { performance: 0.4, rotation: 0.4, load: 0.2 }

describe('priceBand', () => {
  it('matches spec thresholds', () => {
    expect(priceBand(9000)).toBe('A')
    expect(priceBand(15000)).toBe('B')
    expect(priceBand(25000)).toBe('C')
    expect(priceBand(40000)).toBe('D')
  })
})

describe('pickAssignee', () => {
  it('limits band D to the top three close rates', () => {
    const id = pickAssignee(people, {
      maxOpenLeads: 15,
      minShare: 0.08,
      maxHotShare: 0.25,
      band: 'D',
      weights,
      isHot: true,
    })
    expect(['marco', 'giulia', 'sara']).toContain(id)
    expect(id).not.toBe('luca')
  })

  it('keeps band C at or above median close rate', () => {
    const id = pickAssignee(people, {
      maxOpenLeads: 15,
      minShare: 0.08,
      maxHotShare: 0.25,
      band: 'C',
      weights,
      isHot: false,
    })
    expect(['marco', 'giulia', 'sara']).toContain(id)
  })
})
