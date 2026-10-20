// Fatture in Cloud - collegamento OAuth 2.0 (Authorization Code).
// POST { action: "start" } dall'app, solo admin -> { url } da aprire per autorizzare
// GET  ?action=callback&code=...&state=...      -> scambio del codice, salva i token in dealercrm.fic_connection
// Segreti: FIC_CLIENT_ID, FIC_CLIENT_SECRET, FIC_REDIRECT_URI (= URL di questa funzione + ?action=callback), FIC_STATE_SECRET
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { admin, env, handle, HttpError, json, requireUser } from '../_shared/common.ts'

const FIC = 'https://api-v2.fattureincloud.it'
const SCOPES = [
  'entity.clients:a', 'products:r', 'settings:r', 'situation:r',
  'issued_documents.invoices:a', 'issued_documents.proformas:a', 'issued_documents.credit_notes:a', 'issued_documents.receipts:a',
].join(' ')

async function sign(data: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env('FIC_STATE_SECRET')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

Deno.serve(handle(async (req) => {
  const clientId = env('FIC_CLIENT_ID'), clientSecret = env('FIC_CLIENT_SECRET'), redirectUri = env('FIC_REDIRECT_URI')
  if (!clientId || !clientSecret || !redirectUri || !env('FIC_STATE_SECRET')) {
    throw new HttpError(503, 'Mancano i segreti FIC_CLIENT_ID, FIC_CLIENT_SECRET, FIC_REDIRECT_URI, FIC_STATE_SECRET')
  }
  const url = new URL(req.url)

  if (req.method === 'POST') {
    const me = await requireUser(req, ['admin'])
    const { action } = await req.json().catch(() => ({}))
    if (action !== 'start') throw new HttpError(400, 'action sconosciuta')
    // state firmato: concessionario, utente, scadenza 10 minuti
    const payload = `${me.dealership_id}.${me.id}.${Date.now() + 10 * 60 * 1000}`
    const auth = new URL(FIC + '/oauth/authorize')
    auth.searchParams.set('response_type', 'code')
    auth.searchParams.set('client_id', clientId)
    auth.searchParams.set('redirect_uri', redirectUri)
    auth.searchParams.set('scope', SCOPES)
    auth.searchParams.set('state', `${payload}.${await sign(payload)}`)
    return json({ url: auth.toString() })
  }

  if (req.method === 'GET' && url.searchParams.get('action') === 'callback') {
    const code = url.searchParams.get('code')
    const [dealershipId, userId, exp, sig] = (url.searchParams.get('state') ?? '').split('.')
    const payload = `${dealershipId}.${userId}.${exp}`
    if (!code || !sig || sig !== await sign(payload) || Number(exp) < Date.now()) throw new HttpError(400, 'state non valido o scaduto')

    const tok = await fetch(FIC + '/oauth/token', {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'authorization_code', client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, code }),
    })
    const t = await tok.json()
    if (!tok.ok) throw new HttpError(502, 'scambio codice fallito')

    const sb = admin()
    const comp = await fetch(FIC + '/user/companies', { headers: { Authorization: `Bearer ${t.access_token}` } }).then((r) => r.json()).catch(() => null)
    const companies: Array<{ id: number; name: string }> = comp?.data?.companies ?? []
    const { data: cfgRow } = await sb.from('setting').select('id,value').eq('dealership_id', dealershipId).eq('key', 'fatture_in_cloud').maybeSingle()
    const wanted = cfgRow?.value?.company_id
    const company = companies.find((c) => c.id === Number(wanted)) ?? companies[0]
    const { error } = await sb.from('fic_connection').upsert({
      dealership_id: dealershipId, company_id: company?.id ?? null, company_name: company?.name ?? null, connected_by: userId,
      access_token: t.access_token, refresh_token: t.refresh_token, scopes: SCOPES, last_error: null,
      expires_at: new Date(Date.now() + (t.expires_in ?? 86400) * 1000).toISOString(), updated_at: new Date().toISOString(),
    })
    if (error) throw error
    if (company && cfgRow && !wanted) {
      await sb.from('setting').update({ value: { ...cfgRow.value, company_id: company.id } }).eq('id', cfgRow.id)
    }
    const name = String(company?.name ?? 'da scegliere nei Parametri').replace(/[<>&]/g, '')
    return new Response(`<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:2rem"><h2>Fatture in Cloud collegato</h2><p>Azienda: ${name}. Puoi chiudere questa pagina.</p>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }
  throw new HttpError(400, 'richiesta non valida')
}))
