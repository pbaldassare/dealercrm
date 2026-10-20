// Contratto di vendita dalla pratica (bozza HTML stampabile; il PDF e il modello definitivo arrivano con la fase 4).
// POST { deal_id }                 -> genera il documento e restituisce un link temporaneo
// POST { deal_id, open: true }     -> solo il link all'ultimo documento generato
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { admin, handle, HttpError, json, requireUser } from '../_shared/common.ts'

const BUCKET = 'dealercrm-documents'
const TEMPLATE_VERSION = 'bozza-1'
const eur = (n: unknown) => n == null ? '—' : new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(n))
const esc = (s: unknown) => String(s ?? '—').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const SERVICE: Record<string, string> = { gps: 'Antifurto satellitare', cvt: 'Cristalli (CVT)', etching: 'Marchiatura', extended_warranty: 'Garanzia estesa', insurance: 'Polizza', fees: 'Spese pratica' }

Deno.serve(handle(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'metodo non consentito')
  const me = await requireUser(req, ['admin', 'sales_manager', 'salesperson', 'accounting', 'finance_insurance'])
  const { deal_id, open } = await req.json().catch(() => ({}))
  if (!deal_id) throw new HttpError(400, 'deal_id mancante')

  const sb = admin()
  const { data: deal } = await sb.from('deal').select('*').eq('id', deal_id).maybeSingle()
  if (!deal || deal.dealership_id !== me.dealership_id) throw new HttpError(404, 'pratica non trovata')
  if (me.role === 'salesperson' && deal.salesperson_id !== me.id) throw new HttpError(403, 'non autorizzato')

  const signedUrl = async (path: string) => {
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, 3600)
    if (error) throw error
    return data.signedUrl
  }

  if (open) {
    const { data: last } = await sb.from('contract').select('pdf_path').eq('deal_id', deal_id).not('pdf_path', 'is', null)
      .order('generated_at', { ascending: false }).limit(1).maybeSingle()
    if (!last?.pdf_path) throw new HttpError(404, 'nessun contratto generato')
    return json({ url: await signedUrl(last.pdf_path) })
  }

  const [{ data: seller }, { data: buyer }, { data: v }, { data: items }] = await Promise.all([
    sb.from('dealership').select('*').eq('id', deal.dealership_id).single(),
    sb.from('customer').select('*').eq('id', deal.customer_id).single(),
    sb.from('vehicle').select('*').eq('id', deal.vehicle_id).single(),
    sb.from('deal_item').select('type,kind,estimated,actual').eq('deal_id', deal_id),
  ])
  const missing = [
    !buyer?.last_name && 'acquirente', !v?.plate && 'targa', !v?.vin && 'telaio', deal.sale_price == null && 'prezzo', !seller?.vat_number && 'P. IVA venditore',
  ].filter(Boolean)
  if (missing.length) return json({ missing }, 422)

  const fin = deal.financing ?? {}, trade = deal.trade_in ?? {}
  const services = (items ?? []).filter((i) => i.kind === 'revenue' && SERVICE[i.type])
  const balance = Number(deal.sale_price) - Number(deal.deposit ?? 0) - Number(trade.value ?? 0) - Number(fin.amount ?? 0)
  const today = new Date().toLocaleDateString('it-IT')
  const html = `<!doctype html><html lang="it"><meta charset="utf-8"><title>Contratto ${esc(v.plate)}</title>
<style>body{font:14px/1.5 Georgia,serif;max-width:720px;margin:2rem auto;padding:0 1rem}h1{font-size:20px;text-align:center}h2{font-size:15px;margin-top:1.4rem}.firma{margin-top:3rem;display:flex;justify-content:space-between}.nota{color:#a00;font-size:12px}</style>
<p class="nota">Bozza generata automaticamente (modello ${TEMPLATE_VERSION}): da far verificare a un legale prima dell'uso.</p>
<h1>CONTRATTO DI VENDITA DI VEICOLO USATO</h1>
<h2>1. Parti</h2>
<p>Venditore: ${esc(seller.name)}, sede ${esc(seller.address)}, P. IVA ${esc(seller.vat_number)}.<br>
Acquirente: ${esc(`${buyer.first_name} ${buyer.last_name}`)}, tel. ${esc(buyer.phone)}, e-mail ${esc(buyer.email)}.</p>
<h2>2. Veicolo</h2>
<p>${esc(`${v.make} ${v.model} ${v.trim ?? ''}`)}, targa ${esc(v.plate)}, telaio ${esc(v.vin)}, prima immatricolazione ${esc(v.first_registration)}, ${esc(v.mileage_km)} km, colore ${esc(v.color)}, proprietari precedenti ${esc(v.previous_owners)}.</p>
<h2>3. Prezzo e pagamento</h2>
<p>Prezzo: ${eur(deal.sale_price)}. Caparra: ${eur(deal.deposit)}. Permuta: ${eur(trade.value)}. Quota finanziata: ${eur(fin.amount)}${fin.installments ? ` in ${esc(fin.installments)} rate` : ''}. Saldo alla consegna: ${eur(balance)} con mezzi tracciabili.</p>
${trade.value ? `<h2>4. Permuta</h2><p>Veicolo in permuta ${esc(trade.make)} ${esc(trade.model)} targa ${esc(trade.plate)}, valutato ${eur(trade.value)}.</p>` : ''}
${services.length ? `<h2>5. Servizi accessori</h2><ul>${services.map((s) => `<li>${SERVICE[s.type]}: ${eur(s.actual ?? s.estimated)}</li>`).join('')}</ul>` : ''}
<h2>6. Garanzia</h2>
<p>Garanzia legale di conformità di ${esc(deal.warranty_months ?? 24)} mesi dalla consegna.</p>
<h2>7. Conclusione</h2>
<p>Contratto concluso ${deal.conclusion_type === 'distance' ? 'a distanza' : deal.conclusion_type === 'off_premises' ? 'fuori dai locali commerciali' : 'nei locali del venditore'}.</p>
<p>${today}</p>
<div class="firma"><span>Il Venditore ____________</span><span>L'Acquirente ____________</span></div>
</html>`

  const path = `contracts/${deal_id}/${Date.now()}.html`
  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, new Blob([html], { type: 'text/html' }), { contentType: 'text/html', upsert: false })
  if (upErr) throw upErr

  const data = { deal: { sale_price: deal.sale_price, deposit: deal.deposit, financing: fin, trade_in: trade, warranty_months: deal.warranty_months }, vehicle: { plate: v.plate, vin: v.vin }, buyer: { id: buyer.id } }
  // completa la riga creata alla firma, se c'è; altrimenti ne crea una nuova
  const { data: pending } = await sb.from('contract').select('id,data').eq('deal_id', deal_id).is('pdf_path', null).limit(1).maybeSingle()
  const row = { template_version: TEMPLATE_VERSION, pdf_path: path, generated_at: new Date().toISOString() }
  const { error: cErr } = pending
    ? await sb.from('contract').update({ ...row, data: { ...(pending.data ?? {}), ...data } }).eq('id', pending.id)
    : await sb.from('contract').insert({ deal_id, ...row, data })
  if (cErr) throw cErr

  return json({ path, url: await signedUrl(path) })
}))
