// Fatture in Cloud - webhook (CloudEvents, modalità binary).
// GET  -> risponde alla verifica: {"verification": <x-fic-verification-challenge>}
// POST -> verifica la firma ES256, salva l'evento (dedup su ce-id) e segna le fatture collegate
// Segreto obbligatorio: FIC_WEBHOOK_PUBLIC_KEY_B64 (chiave pubblica PEM in Base64 da developers.fattureincloud.it/docs/webhooks/notifications)
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { importSPKI, jwtVerify } from 'npm:jose@5'
import { admin, env, handle, HttpError, json } from '../_shared/common.ts'

async function verify(req: Request, ceId: string, subject: string) {
  const b64 = env('FIC_WEBHOOK_PUBLIC_KEY_B64')
  if (!b64) throw new HttpError(503, 'FIC_WEBHOOK_PUBLIC_KEY_B64 non impostato')
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  try {
    const key = await importSPKI(atob(b64), 'ES256')
    const { payload } = await jwtVerify(token, key, { algorithms: ['ES256'], issuer: 'https://api-v2.fattureincloud.it' })
    if (payload.jti !== ceId || payload.sub !== subject) throw new Error('claim non coerenti')
  } catch (e) {
    throw new HttpError(401, 'firma non valida: ' + String((e as Error).message ?? e))
  }
}

Deno.serve(handle(async (req) => {
  if (req.method === 'GET') {
    const url = new URL(req.url)
    const challenge = req.headers.get('x-fic-verification-challenge') ?? url.searchParams.get('x-fic-verification-challenge')
    return challenge ? json({ verification: challenge }) : json({ ok: true })
  }
  if (req.method !== 'POST') throw new HttpError(405, 'metodo non consentito')

  const ceId = req.headers.get('ce-id')
  const type = req.headers.get('ce-type') ?? 'unknown'
  const subject = req.headers.get('ce-subject') ?? ''
  if (!ceId) throw new HttpError(400, 'ce-id mancante')
  await verify(req, ceId, subject)
  const body = await req.json().catch(() => ({}))

  const sb = admin()
  const { error: insErr } = await sb.from('fic_webhook_event').insert({ id: ceId, type, subject, occurred_at: req.headers.get('ce-time'), payload: body })
  if (insErr?.code === '23505') return json({ ok: true, duplicate: true })
  if (insErr) throw insErr

  // documenti emessi cambiati o cancellati: si annullano i cancellati, gli altri si rileggono da Fatture in Cloud
  const ids: number[] = body?.data?.ids ?? []
  if (type.includes('issued_documents') && ids.length) {
    const companyId = Number(subject.replace('company:', ''))
    const { data: conn } = await sb.from('fic_connection').select('dealership_id').eq('company_id', companyId).maybeSingle()
    if (conn) {
      const patch = type.endsWith('.delete') ? { status: 'cancelled', last_error: null } : { last_error: null }
      await sb.from('invoice').update(patch).in('fic_document_id', ids).eq('dealership_id', conn.dealership_id)
    }
  }
  await sb.from('fic_webhook_event').update({ processed_at: new Date().toISOString() }).eq('id', ceId)
  return json({ ok: true })
}))
