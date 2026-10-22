export type Candidate = {
  id: string
  closeRate: number
  avgResponseMin: number
  received30: number
  openLeads: number
  appointmentsRate: number
}

export type AssignParams = {
  maxOpenLeads: number
  minShare: number
  maxHotShare: number
  band: 'A' | 'B' | 'C' | 'D'
  weights: { performance: number; rotation: number; load: number }
  isHot: boolean
}

function clamp(n: number) {
  return Math.max(0, Math.min(100, n))
}

export function priceBand(value: number): 'A' | 'B' | 'C' | 'D' {
  if (value < 10000) return 'A'
  if (value < 20000) return 'B'
  if (value < 35000) return 'C'
  return 'D'
}

export function scoreCandidate(c: Candidate, all: Candidate[], params: AssignParams) {
  const maxOpen = Math.max(params.maxOpenLeads, 1)
  const maxReceived = Math.max(...all.map((x) => x.received30), 1)
  const perf = clamp(c.closeRate * 70 + c.appointmentsRate * 20 + (1 - Math.min(c.avgResponseMin, 30) / 30) * 10)
  const rotation = clamp(100 - (c.received30 / maxReceived) * 100)
  const load = clamp(100 - (c.openLeads / maxOpen) * 100)
  const { performance, rotation: rw, load: lw } = params.weights
  return performance * perf + rw * rotation + lw * load
}

export function pickAssignee(candidates: Candidate[], params: AssignParams): string | null {
  const median =
    [...candidates].sort((a, b) => a.closeRate - b.closeRate)[Math.floor(candidates.length / 2)]?.closeRate ?? 0
  let pool = candidates.filter((c) => c.openLeads < params.maxOpenLeads)
  if (params.band === 'C') pool = pool.filter((c) => c.closeRate >= median)
  if (params.band === 'D') pool = [...pool].sort((a, b) => b.closeRate - a.closeRate).slice(0, 3)
  if (pool.length === 0) return null
  const ranked = [...pool].sort((a, b) => {
    const diff = scoreCandidate(b, pool, params) - scoreCandidate(a, pool, params)
    if (Math.abs(diff) > 0.001) return diff
    return a.received30 - b.received30
  })
  return ranked[0]?.id ?? null
}
