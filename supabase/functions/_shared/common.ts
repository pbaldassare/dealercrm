// Utilità comuni alle Edge Functions di Dealer CRM: client, risposte JSON, controllo di chi chiama.
import { createClient } from 'npm:@supabase/supabase-js@2'

export const env = (k: string) => Deno.env.get(k) ?? ''

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-device-id',
}

export const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

/** Client con chiave service_role sullo schema dealercrm (solo lato server). */
export const admin = () =>
  createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { db: { schema: 'dealercrm' }, auth: { persistSession: false } })

export type Role =
  | 'admin' | 'owner' | 'sales_manager' | 'salesperson' | 'used_manager'
  | 'reconditioning' | 'yard' | 'accounting' | 'finance_insurance' | 'marketing'

export interface Caller { id: string; role: Role; dealership_id: string }

/** Utente dell'app: token valido, profilo attivo, ruolo ammesso e dispositivo approvato (l'admin ne è esente). */
export async function requireUser(req: Request, roles: Role[]): Promise<Caller> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const sb = admin()
  const { data: { user } } = await sb.auth.getUser(token)
  if (!user) throw new HttpError(401, 'non autenticato')
  const { data: me } = await sb.from('profile').select('id,role,dealership_id,is_active').eq('id', user.id).maybeSingle()
  if (!me?.is_active || !roles.includes(me.role)) throw new HttpError(403, 'non autorizzato')
  if (me.role !== 'admin') {
    const install = req.headers.get('x-device-id') ?? ''
    const { data: dev } = await sb.from('device').select('id').eq('user_id', user.id).eq('install_id', install).eq('status', 'authorized').maybeSingle()
    if (!dev) throw new HttpError(403, 'dispositivo non approvato')
  }
  return me as Caller
}

/** Solo chiamate di sistema (cron, altre funzioni) con la chiave service_role. */
export function requireService(req: Request) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (token && token === env('SUPABASE_SERVICE_ROLE_KEY')) return
  try {
    const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    if (claims.role === 'service_role') return
  } catch { /* token non JWT */ }
  throw new HttpError(403, 'solo chiamate di sistema')
}

/** Firma HMAC-SHA256 del corpo grezzo con WEBHOOK_SECRET, in esadecimale (header x-webhook-signature, anche "sha256=<hex>"). */
export async function verifyWebhook(req: Request, body: string) {
  const secret = env('WEBHOOK_SECRET')
  if (!secret) throw new HttpError(503, 'WEBHOOK_SECRET non impostato')
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)))
  const expected = [...sig].map((b) => b.toString(16).padStart(2, '0')).join('')
  const got = (req.headers.get('x-webhook-signature') ?? '').replace(/^sha256=/, '').toLowerCase()
  let diff = got.length ^ expected.length
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ (got.charCodeAt(i) || 0)
  if (diff !== 0) throw new HttpError(401, 'firma non valida')
}

/** Telefono in formato E.164 (+39 se manca il prefisso internazionale). */
export function normPhone(raw: unknown): string | null {
  if (raw == null) return null
  const p = String(raw).replace(/[^\d+]/g, '')
  if (!p) return null
  if (p.startsWith('+')) return p
  if (p.startsWith('00')) return '+' + p.slice(2)
  return '+39' + p
}

/** Gestione errori uniforme: HttpError diventa la sua risposta, il resto 500. */
export function handle(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
    try {
      return await fn(req)
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status)
      return json({ error: String((e as Error).message ?? e) }, 500)
    }
  }
}
