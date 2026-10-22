import { describe, expect, it } from 'vitest'
import { dealMargin } from './margin'

describe('dealMargin', () => {
  it('matches demo P-001 estimated total 6300', () => {
    const items = [
      { type: 'vehicle_margin', kind: 'revenue' as const, estimated: 5500, actual: null },
      { type: 'financing_interest', kind: 'revenue' as const, estimated: 900, actual: null },
      { type: 'insurance', kind: 'revenue' as const, estimated: 350, actual: null },
      { type: 'gps', kind: 'revenue' as const, estimated: 250, actual: null },
      { type: 'cvt', kind: 'revenue' as const, estimated: 250, actual: null },
      { type: 'etching', kind: 'revenue' as const, estimated: 150, actual: null },
      { type: 'discount', kind: 'cost' as const, estimated: 500, actual: null },
      { type: 'salesperson_commission', kind: 'cost' as const, estimated: 600, actual: null },
    ]
    expect(dealMargin(items, false).margin).toBe(6300)
  })
})
