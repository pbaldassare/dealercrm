// VisionAdapter (sezione 6): l'IA guarda le foto e propone cosa controllare; la conferma resta di una persona.
// POST { action: "compare", vehicle_id, from_condition_id, to_condition_id } -> differenze tra due check (salvate in ai_review del secondo)
// POST { action: "read_dashboard", vehicle_id, path }                       -> km, carburante e spie letti dalla foto del cruscotto
// Con ANTHROPIC_API_KEY usa Claude; senza, un adattatore finto che riassume i danni registrati a mano.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import Anthropic from 'npm:@anthropic-ai/sdk'
import { admin, env, handle, HttpError, json, requireUser } from '../_shared/common.ts'

const BUCKET = 'dealercrm-photos'
const MODEL = 'claude-opus-5-5'
const MAX_PHOTOS = 12 // per check
const FUEL = ['empty', 'quarter', 'half', 'three_quarters', 'full']

const COMPARE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'findings'],
  properties: {
    summary: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['zone', 'kind', 'description', 'confidence'],
        properties: {
          zone: { type: 'string' },
          kind: { type: 'string', enum: ['new_damage', 'repaired', 'worse', 'fuel', 'mileage', 'other'] },
          description: { type: 'string' },
          confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
      },
    },
  },
}
const DASHBOARD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['mileage_km', 'fuel_level', 'warning_lights', 'notes'],
  properties: {
    mileage_km: { type: ['integer', 'null'] },
    fuel_level: { type: ['string', 'null'], enum: [...FUEL, null] },
    warning_lights: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
}

type Block = { type: 'image'; source: { type: 'url'; url: string } } | { type: 'text'; text: string }

/** Una richiesta a Claude con risposta JSON vincolata allo schema; ripiego automatico su un altro modello in caso di rifiuto. */
async function ask<T>(content: Block[], schema: Record<string, unknown>): Promise<T> {
  const client = new Anthropic({ apiKey: env('ANTHROPIC_API_KEY') })
  const params = {
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
    system: "Sei un perito di un concessionario di auto usate. Guardi foto di veicoli e rispondi in italiano, in modo prudente: segnali solo quello che si vede nelle foto e indichi quanto sei sicuro. Non inventare dettagli che le foto non mostrano.",
    messages: [{ role: 'user', content }],
  } as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming
  const res = await client.beta.messages.create(params)
  if (res.stop_reason === 'refusal') throw new HttpError(422, 'Il modello ha rifiutato la richiesta su queste foto')
  const text = res.content.find((b) => b.type === 'text')
  if (!text || text.type !== 'text') throw new Error('risposta vuota dal modello')
  return JSON.parse(text.text) as T
}

Deno.serve(handle(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'metodo non consentito')
  const me = await requireUser(req, ['admin', 'used_manager', 'reconditioning', 'yard', 'sales_manager'])
  const body = await req.json().catch(() => ({}))
  const sb = admin()
  const { data: vehicle } = await sb.from('vehicle').select('id,plate,make,model').eq('id', body.vehicle_id).eq('dealership_id', me.dealership_id).maybeSingle()
  if (!vehicle) throw new HttpError(404, 'veicolo non trovato')
  const real = Boolean(env('ANTHROPIC_API_KEY'))
  const sign = async (paths: string[]) => {
    if (!paths.length) return new Map<string, string>()
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrls(paths, 600)
    if (error) throw error
    return new Map((data ?? []).filter((x) => x.signedUrl).map((x) => [x.path as string, x.signedUrl]))
  }

  if (body.action === 'read_dashboard') {
    const path = String(body.path ?? '')
    if (!path.startsWith(`${vehicle.id}/`)) throw new HttpError(400, 'foto non di questo veicolo')
    if (!real) return json({ mock: true, mileage_km: null, fuel_level: null, warning_lights: [], notes: 'Lettura automatica non attiva: manca ANTHROPIC_API_KEY.' })
    const url = (await sign([path])).get(path)
    if (!url) throw new HttpError(404, 'foto non trovata')
    const out = await ask<{ mileage_km: number | null; fuel_level: string | null; warning_lights: string[]; notes: string }>([
      { type: 'image', source: { type: 'url', url } },
      { type: 'text', text: `Foto del cruscotto di ${vehicle.make} ${vehicle.model} (${vehicle.plate}). Leggi il contachilometri totale (non il parziale) in km, il livello del carburante (${FUEL.join(', ')}) e le spie accese. Se un valore non si legge bene, mettilo a null e spiega nelle note.` },
    ], DASHBOARD_SCHEMA)
    return json({ mock: false, ...out })
  }

  if (body.action === 'compare') {
    const { data: conds } = await sb.from('vehicle_condition').select('id,phase,taken_at,fuel_level,mileage_km,notes')
      .eq('vehicle_id', vehicle.id).in('id', [body.from_condition_id, body.to_condition_id])
    const from = conds?.find((c) => c.id === body.from_condition_id), to = conds?.find((c) => c.id === body.to_condition_id)
    if (!from || !to) throw new HttpError(404, 'check non trovati')
    const [{ data: photos }, { data: damages }] = await Promise.all([
      sb.from('vehicle_photo').select('condition_id,storage_path,kind,zone').in('condition_id', [from.id, to.id]).order('taken_at'),
      sb.from('vehicle_damage').select('condition_id,zone,damage_type,severity,repaired').in('condition_id', [from.id, to.id]),
    ])
    const dmg = (cid: string) => (damages ?? []).filter((d) => d.condition_id === cid)

    let review: Record<string, unknown>
    if (!real) {
      // adattatore finto: confronta solo i danni registrati a mano
      const before = new Set(dmg(from.id).map((d) => `${d.zone}|${d.damage_type}`))
      const findings = [
        ...dmg(to.id).filter((d) => !before.has(`${d.zone}|${d.damage_type}`)).map((d) => ({ zone: d.zone, kind: 'new_damage', description: `${d.damage_type} ${d.severity} non presente nel check precedente`, confidence: 'high' })),
        ...dmg(to.id).filter((d) => d.repaired).map((d) => ({ zone: d.zone, kind: 'repaired', description: `${d.damage_type} segnato come riparato`, confidence: 'high' })),
        ...(from.fuel_level !== to.fuel_level ? [{ zone: 'cruscotto', kind: 'fuel', description: `carburante da ${from.fuel_level ?? '?'} a ${to.fuel_level ?? '?'}`, confidence: 'high' }] : []),
        ...((to.mileage_km ?? 0) - (from.mileage_km ?? 0) > 50 ? [{ zone: 'cruscotto', kind: 'mileage', description: `${(to.mileage_km ?? 0) - (from.mileage_km ?? 0)} km in più`, confidence: 'high' }] : []),
      ]
      review = { mock: true, summary: 'Confronto automatico di prova sui soli dati inseriti (le foto non sono state analizzate: manca ANTHROPIC_API_KEY).', findings }
    } else {
      const pick = (cid: string) => (photos ?? []).filter((p) => p.condition_id === cid).slice(0, MAX_PHOTOS)
      if (!pick(from.id).length || !pick(to.id).length) throw new HttpError(422, 'Servono foto in entrambi i check per il confronto')
      const urls = await sign([...pick(from.id), ...pick(to.id)].map((p) => p.storage_path))
      const blocks = (label: string, cid: string): Block[] => pick(cid).flatMap((p) => {
        const url = urls.get(p.storage_path)
        return url ? [{ type: 'text' as const, text: `${label} · ${p.zone ?? p.kind ?? 'foto'}` }, { type: 'image' as const, source: { type: 'url' as const, url } }] : []
      })
      const content: Block[] = [
        { type: 'text', text: `Veicolo ${vehicle.make} ${vehicle.model} (${vehicle.plate}). Ti mostro le foto di due check: PRIMA (${from.phase}, ${from.taken_at}) e DOPO (${to.phase}, ${to.taken_at}).` },
        ...blocks('PRIMA', from.id),
        ...blocks('DOPO', to.id),
        { type: 'text', text: `Danni registrati a mano PRIMA: ${JSON.stringify(dmg(from.id))}. DOPO: ${JSON.stringify(dmg(to.id))}. Carburante ${from.fuel_level} → ${to.fuel_level}, km ${from.mileage_km} → ${to.mileage_km}.
Confronta le foto della stessa zona: elenca i danni che compaiono solo DOPO, quelli riparati, quelli peggiorati e le differenze di carburante o km. Una voce per ogni punto da far controllare a una persona; se le foto non permettono il confronto di una zona, dillo con confidenza bassa.` },
      ]
      review = { mock: false, model: MODEL, ...(await ask<Record<string, unknown>>(content, COMPARE_SCHEMA)) }
    }
    review = { ...review, from_condition_id: from.id, at: new Date().toISOString(), by: me.id }
    await sb.from('vehicle_condition').update({ ai_review: review }).eq('id', to.id)
    return json(review)
  }

  throw new HttpError(400, 'action sconosciuta')
}))
