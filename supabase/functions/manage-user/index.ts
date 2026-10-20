// Gestione utenti dall'app (solo admin): crea un utente con profilo, reimposta la password, disattiva o riattiva.
// POST { action: "create", email, full_name, role, phone?, password?, enabled_bands? }
// POST { action: "reset_password", user_id }  -> password temporanea nuova
// POST { action: "deactivate" | "activate", user_id }
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { admin, handle, HttpError, json, requireUser, type Role } from '../_shared/common.ts'

const ROLES: Role[] = ['admin', 'owner', 'sales_manager', 'salesperson', 'used_manager', 'reconditioning', 'yard', 'accounting', 'finance_insurance', 'marketing']

function tempPassword() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let s = ''
  crypto.getRandomValues(new Uint8Array(12)).forEach((b) => { s += a[b % a.length] })
  return s + '!'
}

Deno.serve(handle(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'metodo non consentito')
  const me = await requireUser(req, ['admin'])
  const sb = admin()
  const body = await req.json().catch(() => ({}))

  // l'utente su cui si agisce deve essere dello stesso concessionario
  const target = async () => {
    const { data } = await sb.from('profile').select('id,dealership_id').eq('id', body.user_id).maybeSingle()
    if (!data || data.dealership_id !== me.dealership_id) throw new HttpError(404, 'utente non trovato')
    return data.id as string
  }

  if (body.action === 'create') {
    const email = String(body.email ?? '').trim().toLowerCase()
    if (!email || !body.full_name || !ROLES.includes(body.role)) throw new HttpError(400, 'email, full_name e role validi sono obbligatori')
    const password = body.password || tempPassword()
    const { data: created, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: body.full_name } })
    if (error) throw new HttpError(400, error.message)
    const { error: pErr } = await sb.from('profile').insert({
      id: created.user.id, dealership_id: me.dealership_id, full_name: body.full_name, role: body.role, phone: body.phone ?? null,
      enabled_bands: body.enabled_bands ?? ['A', 'B'],
    })
    if (pErr) { await sb.auth.admin.deleteUser(created.user.id); throw new HttpError(400, pErr.message) }
    return json({ ok: true, user_id: created.user.id, temporary_password: body.password ? null : password })
  }
  if (body.action === 'reset_password') {
    const id = await target()
    const password = tempPassword()
    const { error } = await sb.auth.admin.updateUserById(id, { password })
    if (error) throw new HttpError(400, error.message)
    return json({ ok: true, temporary_password: password })
  }
  if (body.action === 'deactivate' || body.action === 'activate') {
    const id = await target()
    if (id === me.id && body.action === 'deactivate') throw new HttpError(400, 'non puoi disattivare te stesso')
    const { error } = await sb.from('profile').update({ is_active: body.action === 'activate' }).eq('id', id)
    if (error) throw new HttpError(400, error.message)
    return json({ ok: true })
  }
  throw new HttpError(400, 'action sconosciuta')
}))
