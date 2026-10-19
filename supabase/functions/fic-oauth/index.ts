// Fatture in Cloud - OAuth 2.0 Authorization Code Flow
// GET ?action=start&dealership_id=...   -> redirect a Fatture in Cloud
// GET ?action=callback&code=...&state=... -> scambio codice, salva token in etidealcrm.fic_connection
// Segreti: FIC_CLIENT_ID, FIC_CLIENT_SECRET, FIC_REDIRECT_URI (= URL di questa funzione + ?action=callback), FIC_STATE_SECRET
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const FIC = 'https://api-v2.fattureincloud.it'
const SCOPES = [
  'entity.clients:a', 'products:r', 'settings:r', 'situation:r',
  'issued_documents.invoices:a', 'issued_documents.proformas:a', 'issued_documents.credit_notes:a', 'issued_documents.receipts:a',
].join(' ')

const env = (k: string) => Deno.env.get(k) ?? ''
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })

async function hmac(data: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env('FIC_STATE_SECRET') || env('SUPABASE_SERVICE_ROLE_KEY')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const action = url.searchParams.get('action') ?? 'start'
  const clientId = env('FIC_CLIENT_ID'), clientSecret = env('FIC_CLIENT_SECRET'), redirectUri = env('FIC_REDIRECT_URI')
  if (!clientId || !clientSecret || !redirectUri) return json({ error: 'Mancano i segreti FIC_CLIENT_ID, FIC_CLIENT_SECRET, FIC_REDIRECT_URI' }, 500)
  const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { db: { schema: 'etidealcrm' } })

  if (action === 'start') {
    const dealershipId = url.searchParams.get('dealership_id')
    if (!dealershipId) return json({ error: 'dealership_id mancante' }, 400)
    const nonce = crypto.randomUUID()
    const state = `${dealershipId}.${nonce}.${await hmac(dealershipId + nonce)}`
    const auth = new URL(FIC + '/oauth/authorize')
    auth.searchParams.set('response_type', 'code')
    auth.searchParams.set('client_id', clientId)
    auth.searchParams.set('redirect_uri', redirectUri)
    auth.searchParams.set('scope', SCOPES)
    auth.searchParams.set('state', state)
    return Response.redirect(auth.toString(), 302)
  }

  if (action === 'callback') {
    const code = url.searchParams.get('code'), state = url.searchParams.get('state') ?? ''
    const [dealershipId, nonce, sig] = state.split('.')
    if (!code || !dealershipId || sig !== await hmac(dealershipId + nonce)) return json({ error: 'state non valido' }, 400)
    const tok = await fetch(FIC + '/oauth/token', {
      method: 'POST', headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'authorization_code', client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, code }),
    })
    const t = await tok.json()
    if (!tok.ok) return json({ error: 'scambio codice fallito', detail: t }, 502)
    // Aziende collegate al token: usa quella in setting.company_id, altrimenti la prima
    const comp = await fetch(FIC + '/user/companies', { headers: { Authorization: `Bearer ${t.access_token}` } }).then(r => r.json()).catch(() => null)
    const companies: Array<{ id: number; name: string }> = comp?.data?.companies ?? []
    const { data: cfgRow } = await supabase.from('setting').select('id,value').eq('dealership_id', dealershipId).eq('key', 'fatture_in_cloud').maybeSingle()
    const wanted = cfgRow?.value?.company_id
    const company = companies.find(c => c.id === Number(wanted)) ?? companies[0]
    const { error } = await supabase.from('fic_connection').upsert({
      dealership_id: dealershipId, company_id: company?.id ?? null, company_name: company?.name ?? null,
      access_token: t.access_token, refresh_token: t.refresh_token,
      expires_at: new Date(Date.now() + (t.expires_in ?? 86400) * 1000).toISOString(), scopes: SCOPES, last_error: null, updated_at: new Date().toISOString(),
    })
    if (error) return json({ error: error.message }, 500)
    if (company && cfgRow && !wanted) {
      await supabase.from('setting').update({ value: { ...cfgRow.value, company_id: company.id }, updated_at: new Date().toISOString() }).eq('id', cfgRow.id)
    }
    return new Response(`<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:2rem"><h2>Fatture in Cloud collegato</h2><p>Azienda: ${company?.name ?? 'da scegliere nei Parametri'} (${company?.id ?? '-'}). Puoi chiudere questa pagina.</p>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }
  return json({ error: 'action sconosciuta' }, 400)
})
