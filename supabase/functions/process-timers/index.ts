// Timer delle lead (di norma li esegue pg_cron ogni minuto): solo chiamate di sistema.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { admin, handle, json, requireService } from '../_shared/common.ts'

Deno.serve(handle(async (req) => {
  requireService(req)
  const { data, error } = await admin().rpc('process_lead_timers')
  if (error) throw error
  return json({ processed: data })
}))
