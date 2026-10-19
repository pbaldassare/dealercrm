import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const body = await req.json()
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const supabase = createClient(url, key, { db: { schema: 'etidealcrm' } })
  await supabase.from('lead').update({ ai_score: body.score, ai_summary: body.summary ?? null, temperature: body.score >= 70 ? 'hot' : 'warm' }).eq('id', body.lead_id)
  if (body.handoff) return new Response(JSON.stringify({ status: 'handoff' }), { headers: { 'Content-Type': 'application/json' } })
  const { error } = await supabase.rpc('change_lead_status', { _lead_id: body.lead_id, _to_status: 'qualified', _payload: { score: body.score } })
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 })
  await supabase.rpc('assign_lead', { _lead_id: body.lead_id })
  return new Response(JSON.stringify({ status: 'assigned' }), { headers: { 'Content-Type': 'application/json' } })
})
