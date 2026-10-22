// Outbox dei portali con adattatori finti (di norma la esegue pg_cron ogni minuto): solo chiamate di sistema.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { admin, handle, json, requireService } from '../_shared/common.ts'

Deno.serve(handle(async (req) => {
  requireService(req)
  const { data, error } = await admin().rpc('process_outbox')
  if (error) throw error
  return json({ sent: data, mock: true })
}))
