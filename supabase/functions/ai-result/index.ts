// Esito della qualifica dal servizio IA esterno.
// POST con firma HMAC-SHA256 del corpo (header x-webhook-signature, segreto WEBHOOK_SECRET).
// Corpo: { lead_id, score, intent?, summary?, purchase_type?, handoff? }
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { admin, handle, HttpError, json, verifyWebhook } from '../_shared/common.ts'
import { applyAiResult } from '../_shared/qualify.ts'

Deno.serve(handle(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'metodo non consentito')
  const raw = await req.text()
  await verifyWebhook(req, raw)
  const body = JSON.parse(raw)
  if (!body.lead_id) throw new HttpError(400, 'lead_id mancante')
  return json(await applyAiResult(admin(), body))
}))
