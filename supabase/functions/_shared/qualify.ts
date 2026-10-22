// Esito della qualifica IA (vera o finta): aggiorna la lead e la passa a un venditore o al responsabile.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export interface AiResult {
  lead_id: string
  score: number
  intent?: string | null
  summary?: string | null
  purchase_type?: 'cash' | 'financing' | 'trade_in' | null
  handoff?: boolean
}

const temperature = (score: number) => (score >= 70 ? 'hot' : score >= 45 ? 'warm' : 'cold')

export async function applyAiResult(sb: SupabaseClient, r: AiResult) {
  const score = Math.max(0, Math.min(100, Math.round(Number(r.score) || 0)))
  const { data: lead, error } = await sb.from('lead')
    .update({ ai_score: score, ai_intent: r.intent ?? null, ai_summary: r.summary ?? null, temperature: temperature(score), purchase_type: r.purchase_type ?? null })
    .eq('id', r.lead_id).select('id,dealership_id,status').single()
  if (error) throw error
  if (lead.status !== 'ai_qualifying') return { status: lead.status }

  const rpc = async (fn: string, args: Record<string, unknown>) => { const { error } = await sb.rpc(fn, args); if (error) throw error }
  if (r.handoff) {
    // passaggio a una persona: qualificata e assegnata al responsabile vendite
    const { data: mgr } = await sb.from('profile').select('id').eq('dealership_id', lead.dealership_id).eq('role', 'sales_manager').eq('is_active', true).limit(1).maybeSingle()
    await rpc('_set_lead_status', { _lead_id: r.lead_id, _to: 'qualified', _payload: { score, handoff: true } })
    await rpc('_assign_lead', { _lead_id: r.lead_id, _to: mgr?.id ?? null, _why: 'ai_handoff' })
    return { status: 'handoff' }
  }
  // change_lead_status assegna da sola la lead qualificata
  await rpc('change_lead_status', { _lead_id: r.lead_id, _to_status: 'qualified', _payload: { score } })
  return { status: 'assigned' }
}

/** MockAiQualifier: punteggio con regole semplici, finché FEATURE_MESSAGING_REAL è spento. */
export function mockQualify(input: { message?: string | null; hasVehicle: boolean; hasPhone: boolean; hasEmail: boolean }) {
  const msg = (input.message ?? '').toLowerCase()
  let score = 35
  if (input.hasVehicle) score += 20
  if (input.hasPhone) score += 15
  if (input.hasEmail) score += 5
  if (/disponibil|prezzo|vedere|visionar|prova|test drive|appuntament/.test(msg)) score += 15
  if (/finanz|rate|permut/.test(msg)) score += 10
  const purchase_type = /permut/.test(msg) ? 'trade_in' : /finanz|rate/.test(msg) ? 'financing' : null
  return {
    score: Math.min(100, score),
    intent: input.hasVehicle ? 'interesse_veicolo' : 'richiesta_generica',
    summary: 'Qualifica automatica di prova (MockAiQualifier): punteggio calcolato con regole semplici.',
    purchase_type: purchase_type as AiResult['purchase_type'],
    handoff: false,
  }
}
