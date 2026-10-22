export type DealItem = {
  type: string
  kind: 'revenue' | 'cost'
  estimated: number
  actual: number | null
}

export function dealMargin(items: DealItem[], useActual: boolean) {
  const amount = (item: DealItem) => (useActual ? (item.actual ?? item.estimated) : item.estimated)
  const revenue = items.filter((i) => i.kind === 'revenue').reduce((sum, i) => sum + amount(i), 0)
  const cost = items.filter((i) => i.kind === 'cost').reduce((sum, i) => sum + amount(i), 0)
  return { revenue, cost, margin: revenue - cost }
}
