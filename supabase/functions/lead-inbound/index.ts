// Ingresso delle lead dai canali (portali, sito, WhatsApp, voce, social).
// POST con firma HMAC-SHA256 del corpo (header x-webhook-signature, segreto WEBHOOK_SECRET).
// Corpo: { channel, source_ref?, contact: { name, phone?, email? }, message?, vehicle_plate?, received_at? }
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { admin, env, handle, HttpError, json, normPhone, verifyWebhook } from '../_shared/common.ts'
import { applyAiResult, mockQualify } from '../_shared/qualify.ts'

const CHANNELS = ['autoscout24', 'other_portal', 'website', 'whatsapp', 'voicemail', 'phone', 'facebook', 'instagram', 'walk_in']
// quale interruttore IA vale per ogni canale (setting ai_switches)
const AI_SWITCH: Record<string, string | null> = {
  phone: 'voice', voicemail: 'voice', whatsapp: 'whatsapp', autoscout24: 'whatsapp', other_portal: 'whatsapp', website: 'whatsapp',
  facebook: 'social', instagram: 'social', walk_in: null,
}

Deno.serve(handle(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'metodo non consentito')
  const raw = await req.text()
  await verifyWebhook(req, raw)
  const p = JSON.parse(raw)
  if (!CHANNELS.includes(p.channel)) throw new HttpError(400, 'channel non valido')

  const sb = admin()
  const dealershipId = env('DEALERSHIP_ID') ||
    (await sb.from('dealership').select('id').order('created_at').limit(1).single()).data?.id
  if (!dealershipId) throw new HttpError(500, 'concessionario non trovato')

  // cliente: si riusa se telefono o e-mail sono già noti
  const phone = normPhone(p.contact?.phone)
  const email = p.contact?.email ? String(p.contact.email).trim().toLowerCase() : null
  let customerId: string | null = null
  if (phone) customerId = (await sb.from('customer').select('id').eq('dealership_id', dealershipId).eq('phone', phone).maybeSingle()).data?.id ?? null
  if (!customerId && email) customerId = (await sb.from('customer').select('id').eq('dealership_id', dealershipId).ilike('email', email).maybeSingle()).data?.id ?? null
  if (!customerId) {
    const [first, ...rest] = String(p.contact?.name ?? '').trim().split(/\s+/)
    const { data, error } = await sb.from('customer')
      .insert({ dealership_id: dealershipId, first_name: first || '', last_name: rest.join(' ') || first || 'Cliente', phone, email })
      .select('id').single()
    if (error) throw error
    customerId = data.id
  }

  let vehicleId: string | null = null
  if (p.vehicle_plate) {
    const plate = String(p.vehicle_plate).replace(/\s/g, '').toUpperCase()
    vehicleId = (await sb.from('vehicle').select('id').eq('dealership_id', dealershipId).eq('plate', plate).maybeSingle()).data?.id ?? null
  }

  const { data: lead, error: lErr } = await sb.from('lead').insert({
    dealership_id: dealershipId, customer_id: customerId, channel: p.channel, vehicle_id: vehicleId, interest_text: p.message ?? null,
    source_ref: p.source_ref || `${p.channel}:${new Date().toISOString().slice(0, 16)}`,
    created_at: p.received_at ?? undefined,
  }).select('id').single()
  if (lErr) throw lErr
  if (p.message) await sb.from('conversation').insert({ lead_id: lead.id, channel: p.channel, direction: 'in', body: p.message })

  // IA spenta su questo canale: la lead va al responsabile vendite
  const { data: sw } = await sb.from('setting').select('value').eq('dealership_id', dealershipId).eq('key', 'ai_switches').maybeSingle()
  const key = AI_SWITCH[p.channel]
  if (!key || !sw?.value?.[key]) {
    const { data: mgr } = await sb.from('profile').select('id').eq('dealership_id', dealershipId).eq('role', 'sales_manager').eq('is_active', true).limit(1).maybeSingle()
    const { error } = await sb.rpc('_assign_lead', { _lead_id: lead.id, _to: mgr?.id ?? null, _why: 'ai_off' })
    if (error) throw error
    return json({ lead_id: lead.id, status: 'new', assigned_to: 'sales_manager' })
  }

  const { error: sErr } = await sb.rpc('change_lead_status', { _lead_id: lead.id, _to_status: 'ai_qualifying', _payload: {} })
  if (sErr) throw sErr
  if (env('FEATURE_MESSAGING_REAL') === 'true') return json({ lead_id: lead.id, status: 'ai_qualifying' })

  const res = await applyAiResult(sb, { lead_id: lead.id, ...mockQualify({ message: p.message, hasVehicle: !!vehicleId, hasPhone: !!phone, hasEmail: !!email }) })
  return json({ lead_id: lead.id, ...res, mock: true })
}))
