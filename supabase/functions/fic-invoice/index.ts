// Fatture in Cloud - creazione fattura da una pratica
// POST { invoice_id } oppure { deal_id }  (chiamata dall'app o dall'outbox-worker per l'azione create_invoice)
// GET  ?action=lookups&dealership_id=... -> IVA, metodi e conti di pagamento dell'azienda (per compilare i Parametri)
// Con setting.fatture_in_cloud.dry_run = true la fattura si prepara e si valida con /issued_documents/totals ma non si crea.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const FIC = 'https://api-v2.fattureincloud.it'
const env = (k: string) => Deno.env.get(k) ?? ''
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const sb = () => createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { db: { schema: 'etidealcrm' } })

// Token valido: rinnova se scade entro 10 minuti (expires_in = 24 h, refresh token valido 1 anno dall'ultimo uso)
async function accessToken(supabase: ReturnType<typeof sb>, dealershipId: string) {
  const { data: c } = await supabase.from('fic_connection').select('*').eq('dealership_id', dealershipId).maybeSingle()
  if (!c?.refresh_token) throw new Error('Fatture in Cloud non collegato: avvia fic-oauth?action=start')
  if (c.access_token && c.expires_at && new Date(c.expires_at).getTime() - Date.now() > 10 * 60 * 1000) return { token: c.access_token, companyId: c.company_id }
  const r = await fetch(FIC + '/oauth/token', {
    method: 'POST', headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'refresh_token', client_id: env('FIC_CLIENT_ID'), client_secret: env('FIC_CLIENT_SECRET'), refresh_token: c.refresh_token }),
  })
  const t = await r.json()
  if (!r.ok) { await supabase.from('fic_connection').update({ last_error: JSON.stringify(t) }).eq('dealership_id', dealershipId); throw new Error('rinnovo token fallito') }
  await supabase.from('fic_connection').update({ access_token: t.access_token, refresh_token: t.refresh_token ?? c.refresh_token,
    expires_at: new Date(Date.now() + (t.expires_in ?? 86400) * 1000).toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq('dealership_id', dealershipId)
  return { token: t.access_token, companyId: c.company_id }
}

async function fic(token: string, path: string, init: RequestInit = {}) {
  const r = await fetch(FIC + path, { ...init, headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } })
  const body = await r.json().catch(() => ({}))
  if (r.status === 429 || r.status === 403) { const ra = r.headers.get('Retry-After'); throw Object.assign(new Error(`Fatture in Cloud ${r.status}: ${JSON.stringify(body?.error ?? body)}`), { retryAfter: ra }) }
  if (!r.ok) throw new Error(`Fatture in Cloud ${r.status}: ${JSON.stringify(body?.error ?? body)}`)
  return body
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const supabase = sb()
  const url = new URL(req.url)
  try {
    if (req.method === 'GET' && url.searchParams.get('action') === 'lookups') {
      const dealershipId = url.searchParams.get('dealership_id')!
      const { token, companyId } = await accessToken(supabase, dealershipId)
      const [vat, pm, pa] = await Promise.all([
        fic(token, `/c/${companyId}/info/vat_types`), fic(token, `/c/${companyId}/info/payment_methods`), fic(token, `/c/${companyId}/info/payment_accounts`)])
      return json({ company_id: companyId, vat_types: vat.data, payment_methods: pm.data, payment_accounts: pa.data })
    }

    const body = await req.json().catch(() => ({}))
    let invoiceId: string | null = body.invoice_id ?? null
    if (!invoiceId && body.deal_id) {
      const { data, error } = await supabase.rpc('request_invoice', { _deal_id: body.deal_id })
      if (error) throw new Error(error.message)
      invoiceId = data.id
    }
    if (!invoiceId) return json({ error: 'invoice_id o deal_id mancante' }, 400)

    const { data: inv } = await supabase.from('invoice').select('*').eq('id', invoiceId).single()
    if (!inv) return json({ error: 'fattura non trovata' }, 404)
    if (inv.fic_document_id) return json({ ok: true, already: true, fic_document_id: inv.fic_document_id })

    // Ricalcola il corpo dalla pratica (le voci possono essere cambiate dopo la richiesta)
    const { data: payload } = await supabase.rpc('build_invoice_payload', { _deal_id: inv.deal_id })
    const { data: cfgRow } = await supabase.from('setting').select('value').eq('dealership_id', inv.dealership_id).eq('key', 'fatture_in_cloud').maybeSingle()
    const cfg = cfgRow?.value ?? {}
    const missing = ['company_id', 'vat_id_standard', 'payment_method_id'].filter(k => cfg[k] == null)
    const dryRun = cfg.dry_run !== false || !cfg.enabled || missing.length > 0

    const { token, companyId } = await accessToken(supabase, inv.dealership_id)

    if (dryRun) {
      // Verifica i totali senza creare nulla
      let totals: unknown = null, err: string | null = null
      try { totals = (await fic(token, `/c/${companyId}/issued_documents/totals`, { method: 'POST', body: JSON.stringify(payload) })).data } catch (e) { err = String(e) }
      await supabase.from('invoice').update({ status: err ? 'error' : 'draft', payload, response: totals, dry_run: true,
        last_error: err ?? (missing.length ? 'Parametri mancanti: ' + missing.join(', ') : null), updated_at: new Date().toISOString() }).eq('id', invoiceId)
      return json({ ok: !err, dry_run: true, missing, totals, error: err })
    }

    const res = await fic(token, `/c/${companyId}/issued_documents`, { method: 'POST', body: JSON.stringify(payload) })
    const d = res.data
    await supabase.from('invoice').update({ status: 'created', fic_document_id: d.id, number: d.number, numeration: d.numeration, date: d.date,
      amount_net: d.amount_net, amount_vat: d.amount_vat, amount_gross: d.amount_gross, fic_url: d.url ?? null, payload, response: d, dry_run: false,
      last_error: null, updated_at: new Date().toISOString() }).eq('id', invoiceId)
    return json({ ok: true, fic_document_id: d.id, number: d.number, amount_gross: d.amount_gross })
  } catch (e) {
    const msg = String((e as Error).message ?? e)
    const b = await req.clone().json().catch(() => ({}))
    if (b?.invoice_id) await supabase.from('invoice').update({ status: 'error', last_error: msg, updated_at: new Date().toISOString() }).eq('id', b.invoice_id)
    return json({ error: msg, retry_after: (e as { retryAfter?: string }).retryAfter ?? null }, 500)
  }
})
