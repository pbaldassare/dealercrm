// Fatture in Cloud - webhook (CloudEvents, modalità binary)
// GET  -> risponde alla verifica: {"verification": <x-fic-verification-challenge>}
// POST -> salva l'evento (dedup su ce-id), aggiorna lo stato delle fatture collegate
// Segreto: FIC_WEBHOOK_PUBLIC_KEY_B64 (chiave pubblica PEM in Base64 dalla pagina docs/webhooks/notifications). Senza chiave gli eventi si accettano ma si segnano come non verificati.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { jwtVerify, importSPKI } from 'npm:jose@5'

const env = (k: string) => Deno.env.get(k) ?? ''
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })

async function verify(req: Request, ceId: string, subject: string) {
  const b64 = env('FIC_WEBHOOK_PUBLIC_KEY_B64')
  if (!b64) return 'unverified'
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const pem = atob(b64)
  const key = await importSPKI(pem, 'ES256')
  const { payload } = await jwtVerify(token, key, { algorithms: ['ES256'], issuer: 'https://api-v2.fattureincloud.it' })
  if (payload.jti !== ceId || payload.sub !== subject) throw new Error('claim non coerenti')
  return 'verified'
}

Deno.serve(async (req) => {
  if (req.method === 'GET') {
    const url = new URL(req.url)
    const challenge = req.headers.get('x-fic-verification-challenge') ?? url.searchParams.get('x-fic-verification-challenge')
    if (!challenge) return json({ ok: true, info: 'fic-webhook attivo' })
    return json({ verification: challenge })
  }
  if (req.method !== 'POST') return json({ error: 'metodo' }, 405)

  const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { db: { schema: 'etidealcrm' } })
  const ceId = req.headers.get('ce-id') ?? crypto.randomUUID()
  const type = req.headers.get('ce-type') ?? 'unknown'
  const subject = req.headers.get('ce-subject') ?? ''
  const time = req.headers.get('ce-time')
  const body = await req.json().catch(() => ({}))

  let status = 'unverified'
  try { status = await verify(req, ceId, subject) } catch (e) { return json({ error: 'firma non valida: ' + String(e) }, 401) }

  // Dedup: at-least-once delivery
  const { error: insErr } = await supabase.from('fic_webhook_event').insert({ id: ceId, type, subject, occurred_at: time, payload: { ...body, _signature: status } })
  if (insErr && insErr.code === '23505') return json({ ok: true, duplicate: true })
  if (insErr) return json({ error: insErr.message }, 500)

  // Elaborazione leggera, idempotente: le fatture emesse cambiate (pagata, inviata a SDI...) si rileggono in fic-invoice o dall'app.
  const ids: number[] = body?.data?.ids ?? []
  if (type.includes('issued_documents') && ids.length) {
    const companyId = Number(subject.replace('company:', ''))
    const { data: conn } = await supabase.from('fic_connection').select('dealership_id').eq('company_id', companyId).maybeSingle()
    if (conn) {
      await supabase.from('invoice').update({ updated_at: new Date().toISOString(), last_error: null,
        status: type.endsWith('.delete') ? 'cancelled' : undefined }).in('fic_document_id', ids).eq('dealership_id', conn.dealership_id)
    }
  }
  await supabase.from('fic_webhook_event').update({ processed_at: new Date().toISOString() }).eq('id', ceId)
  return json({ ok: true })
})
