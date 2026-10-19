import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })
  const secret = Deno.env.get('WEBHOOK_SECRET') ?? ''
  const sig = req.headers.get('x-webhook-signature') ?? ''
  const body = await req.text()
  if (secret && !timingSafeEqual(sig, secret)) {
    return new Response('unauthorized', { status: 401 })
  }
  const payload = JSON.parse(body)
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const supabase = createClient(url, key, { db: { schema: 'etidealcrm' } })
  const dealershipId = '10000000-0000-4000-8000-000000000001'
  const names = (payload.contact?.name ?? 'Cliente Demo').split(' ')
  const { data: customer, error: cErr } = await supabase.from('customer').insert({
    dealership_id: dealershipId,
    first_name: names[0] ?? 'Cliente',
    last_name: names.slice(1).join(' ') || 'Inbound',
    phone: payload.contact?.phone,
    email: payload.contact?.email,
    is_demo: true,
  }).select('id').single()
  if (cErr) return new Response(JSON.stringify({ error: cErr.message }), { status: 400 })
  let vehicleId = null
  if (payload.vehicle_plate) {
    const v = await supabase.from('vehicle').select('id').eq('plate', String(payload.vehicle_plate).replace(/\s/g, '').toUpperCase()).maybeSingle()
    vehicleId = v.data?.id ?? null
  }
  const { data: lead, error: lErr } = await supabase.from('lead').insert({
    dealership_id: dealershipId,
    customer_id: customer.id,
    channel: payload.channel,
    source_ref: payload.source_ref,
    vehicle_id: vehicleId,
    interest_text: payload.message,
    status: 'new',
    is_demo: true,
  }).select('id').single()
  if (lErr) return new Response(JSON.stringify({ error: lErr.message }), { status: 400 })
  await supabase.from('conversation').insert({ lead_id: lead.id, channel: payload.channel, direction: 'in', body: payload.message })
  await supabase.rpc('change_lead_status', { _lead_id: lead.id, _to_status: 'ai_qualifying', _payload: {} })
  return new Response(JSON.stringify({ lead_id: lead.id, status: 'ai_qualifying' }), { headers: { 'Content-Type': 'application/json' } })
})
