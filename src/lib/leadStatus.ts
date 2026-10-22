export const LEAD_STATUSES = [
  'new',
  'ai_qualifying',
  'qualified',
  'assigned',
  'contacted',
  'appointment_set',
  'visited',
  'proposal_sent',
  'negotiating',
  'won',
  'lost',
  'invalid',
] as const

export type LeadStatus = (typeof LEAD_STATUSES)[number]

const TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  new: ['ai_qualifying', 'invalid'],
  ai_qualifying: ['qualified', 'invalid'],
  qualified: ['assigned'],
  assigned: ['contacted'],
  contacted: ['appointment_set', 'lost'],
  appointment_set: ['visited', 'lost', 'contacted'],
  visited: ['proposal_sent', 'lost'],
  proposal_sent: ['negotiating', 'lost'],
  negotiating: ['won', 'lost'],
  won: [],
  lost: [],
  invalid: [],
}

export function canChangeLeadStatus(from: LeadStatus, to: LeadStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

export function remainingTone(remainingSeconds: number | null, totalMinutes: number | null): 'green' | 'orange' | 'red' {
  if (remainingSeconds == null || totalMinutes == null) return 'green'
  if (remainingSeconds < 0) return 'red'
  if (remainingSeconds < totalMinutes * 60 * 0.25) return 'orange'
  return 'green'
}

export function mockQualify(message: string): { score: number; temperature: 'hot' | 'warm' | 'cold' | 'invalid' } {
  const lower = message.toLowerCase()
  if (lower.includes('disponibile') || lower.includes('prezzo')) return { score: 80, temperature: 'hot' }
  if (lower.length < 8) return { score: 10, temperature: 'invalid' }
  return { score: 55, temperature: 'warm' }
}
