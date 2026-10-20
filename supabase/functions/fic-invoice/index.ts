// Fatture in Cloud - fattura dalla pratica (ruoli admin, owner, accounting).
// POST { deal_id, kind? }   -> crea la riga fattura (request_invoice) e la invia
// POST { invoice_id }       -> invia una fattura già in coda
// POST { action: "lookups" } -> IVA, metodi e conti di pagamento per i Parametri (solo admin)
// Con setting.fatture_in_cloud.dry_run = true (o parametri mancanti) si verificano solo i totali con /issued_documents/totals.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { admin, env, handle, HttpError, json, requireUser } from '../_shared/common.ts'

const FIC = 'https://api-v2.fattureincloud.it'
type Sb = ReturnType<typeof admin>

// Token valido: rinnova se scade entro 10 minuti (access token 24 h, refresh token 1 anno dall'ultimo uso)
async function accessToken(sb: Sb, dealershipId: string) {
  const { data: c } = await sb.from('fic_connection').select('*').eq('dealership_id', dealershipId).maybeSingle()
  if (!c?.refresh_token) throw new HttpError(409, 'Fatture in Cloud non collegato')
  if (c.access_token && c.expires_at && new Date(c.expires_at).getTime() - Date.now() > 10 * 60 * 1000) return { token: c.access_token, companyId: c.company_id }
  const r = await fetch(FIC + '/oauth/token', {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'refresh_token', client_id: env('FIC_CLIENT_ID'), client_secret: env('FIC_CLIENT_SECRET'), refresh_token: c.refresh_token }),
  })
  const t = await r.json()
  if (!r.ok) {
    await sb.from('fic_connection').update({ last_error: JSON.stringify(t) }).eq('dealership_id', dealershipId)
    throw new Error('rinnovo token Fatture in Cloud fallito')
  }
  await sb.from('fic_connection').update({
    access_token: t.access_token, refresh_token: t.refresh_token ?? c.refresh_token,
    expires_at: new Date(Date.now() + (t.expires_in ?? 86400) * 1000).toISOString(), last_error: null, updated_at: new Date().toISOString(),
  }).eq('dealership_id', dealershipId)
  return { token: t.access_token, companyId: c.company_id }
}

async function fic(token: string, path: string, init: RequestInit = {}) {
  const r = await fetch(FIC + path, { ...init, headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } })
  const body = await r.json().catch(() => ({}))
  if (!r.ok) {
    const ra = r.headers.get('Retry-After')
    throw new Error(`Fatture in Cloud ${r.status}${ra ? ` (riprova tra ${ra} s)` : ''}: ${JSON.stringify(body?.error ?? body)}`)
  }
  return body
}

Deno.serve(handle(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'metodo non consentito')
  const body = await req.json().catch(() => ({}))
  const sb = admin()

  if (body.action === 'lookups') {
    const me = await requireUser(req, ['admin'])
    const { token, companyId } = await accessToken(sb, me.dealership_id)
    const [vat, pm, pa] = await Promise.all([
      fic(token, `/c/${companyId}/info/vat_types`), fic(token, `/c/${companyId}/info/payment_methods`), fic(token, `/c/${companyId}/info/payment_accounts`)])
    return json({ company_id: companyId, vat_types: vat.data, payment_methods: pm.data, payment_accounts: pa.data })
  }

  const me = await requireUser(req, ['admin', 'owner', 'accounting'])
  let invoiceId: string | null = body.invoice_id ?? null
  if (!invoiceId && body.deal_id) {
    const { data: deal } = await sb.from('deal').select('dealership_id').eq('id', body.deal_id).maybeSingle()
    if (!deal || deal.dealership_id !== me.dealership_id) throw new HttpError(404, 'pratica non trovata')
    const { data, error } = await sb.rpc('request_invoice', { _deal_id: body.deal_id, _kind: body.kind ?? 'invoice' })
    if (error) throw error
    invoiceId = data.id
    await sb.from('invoice').update({ requested_by: me.id }).eq('id', invoiceId)
  }
  if (!invoiceId) throw new HttpError(400, 'invoice_id o deal_id mancante')

  const { data: inv } = await sb.from('invoice').select('*').eq('id', invoiceId).maybeSingle()
  if (!inv || inv.dealership_id !== me.dealership_id) throw new HttpError(404, 'fattura non trovata')
  if (inv.fic_document_id) return json({ ok: true, already: true, fic_document_id: inv.fic_document_id })

  try {
    // corpo ricalcolato dalla pratica: le voci possono essere cambiate dopo la richiesta
    const { data: payload, error: pErr } = await sb.rpc('build_invoice_payload', { _deal_id: inv.deal_id })
    if (pErr) throw pErr
    const { data: cfgRow } = await sb.from('setting').select('value').eq('dealership_id', inv.dealership_id).eq('key', 'fatture_in_cloud').maybeSingle()
    const cfg = cfgRow?.value ?? {}
    const missing = ['company_id', 'vat_id_standard', 'vat_id_margin', 'payment_method_id'].filter((k) => cfg[k] == null)
    const dryRun = cfg.dry_run !== false || !cfg.enabled || missing.length > 0
    const { token, companyId } = await accessToken(sb, inv.dealership_id)

    if (dryRun) {
      const totals = (await fic(token, `/c/${companyId}/issued_documents/totals`, { method: 'POST', body: JSON.stringify(payload) })).data
      await sb.from('invoice').update({ status: 'draft', payload, response: totals, dry_run: true,
        last_error: missing.length ? 'Parametri mancanti: ' + missing.join(', ') : null }).eq('id', invoiceId)
      return json({ ok: true, dry_run: true, missing, totals })
    }

    const d = (await fic(token, `/c/${companyId}/issued_documents`, { method: 'POST', body: JSON.stringify(payload) })).data
    await sb.from('invoice').update({ status: 'created', fic_document_id: d.id, number: d.number, numeration: d.numeration, date: d.date,
      amount_net: d.amount_net, amount_vat: d.amount_vat, amount_gross: d.amount_gross, fic_url: d.url ?? null, payload, response: d,
      dry_run: false, last_error: null }).eq('id', invoiceId)
    return json({ ok: true, fic_document_id: d.id, number: d.number, amount_gross: d.amount_gross })
  } catch (e) {
    const msg = String((e as Error).message ?? e)
    await sb.from('invoice').update({ status: 'error', last_error: msg }).eq('id', invoiceId)
    throw e instanceof HttpError ? e : new HttpError(502, msg)
  }
}))
