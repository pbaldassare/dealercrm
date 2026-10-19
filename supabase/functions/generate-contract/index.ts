import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const { deal_id } = await req.json()
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const supabase = createClient(url, key, { db: { schema: 'etidealcrm' } })
  const { data: deal, error } = await supabase.from('deal').select('*').eq('id', deal_id).maybeSingle()
  if (error || !deal) return new Response(JSON.stringify({ missing: ['deal'] }), { status: 400 })
  const html = `<html><body><h1>Contratto</h1><p>Pratica ${deal_id}</p><p>Prezzo ${deal.sale_price}</p></body></html>`
  const path = `documents/contracts/${deal_id}.html`
  await supabase.storage.from('documents').upload(path, new Blob([html], { type: 'text/html' }), { upsert: true })
  await supabase.from('contract').insert({ deal_id, template_version: 'draft-1', data: deal, pdf_path: path, generated_at: new Date().toISOString() })
  return new Response(JSON.stringify({ pdf_path: path, mock: true }), { headers: { 'Content-Type': 'application/json' } })
})
