// Foto dei veicoli nel bucket privato dealercrm-photos, sempre tramite link firmati.
// POST { action: "upload", vehicle_id, file_name }  -> { path, token } per uploadToSignedUrl (ruoli che fanno i check)
// POST { action: "urls", paths: [...] }             -> { urls: { path: signedUrl } } validi un'ora (chi vede il veicolo)
// I percorsi sono "<vehicle_id>/<file>": il primo segmento dice a quale veicolo appartiene la foto.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { admin, handle, HttpError, json, requireUser, type Role } from '../_shared/common.ts'

const BUCKET = 'dealercrm-photos'
const ALL: Role[] = ['admin', 'owner', 'sales_manager', 'salesperson', 'used_manager', 'reconditioning', 'yard', 'accounting', 'finance_insurance', 'marketing']
const WRITERS: Role[] = ['admin', 'used_manager', 'reconditioning', 'yard']

Deno.serve(handle(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'metodo non consentito')
  const body = await req.json().catch(() => ({}))
  const sb = admin()

  if (body.action === 'upload') {
    const me = await requireUser(req, WRITERS)
    const { data: v } = await sb.from('vehicle').select('id').eq('id', body.vehicle_id).eq('dealership_id', me.dealership_id).maybeSingle()
    if (!v) throw new HttpError(404, 'veicolo non trovato')
    const name = String(body.file_name ?? '').replace(/[^\w.-]/g, '_').slice(0, 80) || `${crypto.randomUUID()}.jpg`
    const path = `${v.id}/${Date.now()}-${name}`
    const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(path)
    if (error) throw error
    return json({ path, token: data.token })
  }

  if (body.action === 'urls') {
    const me = await requireUser(req, ALL)
    const paths: string[] = Array.isArray(body.paths) ? body.paths.slice(0, 200).map(String) : []
    const ids = [...new Set(paths.map((p) => p.split('/')[0]))]
    const { data: own } = ids.length ? await sb.from('vehicle').select('id').in('id', ids).eq('dealership_id', me.dealership_id) : { data: [] }
    const allowed = new Set((own ?? []).map((x) => x.id))
    const ok = paths.filter((p) => allowed.has(p.split('/')[0]))
    if (!ok.length) return json({ urls: {} })
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrls(ok, 3600)
    if (error) throw error
    return json({ urls: Object.fromEntries((data ?? []).filter((x) => x.signedUrl).map((x) => [x.path, x.signedUrl])) })
  }

  throw new HttpError(400, 'action sconosciuta')
}))
