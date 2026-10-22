import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { callFunction, supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Pill, type Tone } from "@/components/ui/pill";
import { fmtDate, fmtDateTime, fmtEur, parseNum } from "@/lib/utils";
import { DEAL_STATUS, type DealRow } from "./DealsPage";

export const ITEM_TYPE: Record<string, string> = {
  vehicle_margin: "Margine veicolo", financing_interest: "Interessi finanziamento", insurance: "Assicurazione", cvt: "CVT", gps: "Satellitare",
  etching: "Marchiatura", extended_warranty: "Garanzia estesa", fees: "Spese pratica", discount: "Sconto", salesperson_commission: "Provvigione venditore", other_cost: "Altro costo",
};
const REVENUE = ["financing_interest", "insurance", "cvt", "gps", "etching", "extended_warranty", "fees"];
const COST = ["discount", "salesperson_commission", "other_cost"];
const STEPS = ["open", "quote_sent", "contract_pending", "signed", "payment_pending", "transfer_documents", "delivered", "closed"];
const INV_STATUS: Record<string, [string, Tone]> = { draft: ["Bozza (prova)", "muted"], queued: ["In coda", "info"], created: ["Creata", "ok"], sent: ["Inviata a SDI", "ok"], paid: ["Pagata", "ok"], error: ["Errore", "bad"], cancelled: ["Annullata", "muted"] };

interface Item { id: string; type: string; kind: "revenue" | "cost"; estimated: number | null; actual: number | null; status: string; source: string | null }

export function DealDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const canCost = profile && !["salesperson", "reconditioning", "yard", "marketing"].includes(profile.role);
  const canInvoice = profile && ["admin", "owner", "accounting"].includes(profile.role);
  const [newItem, setNewItem] = useState({ type: "insurance", amount: "" });

  const deal = useQuery({
    queryKey: ["deal", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("deal").select("*").eq("id", id!).single();
      if (error) throw error;
      const d = data as DealRow;
      const [v, c, s, items, contracts, invoices, lead] = await Promise.all([
        supabase.from("vehicle_public").select("plate,make,model,trim,mileage_km").eq("id", d.vehicle_id).maybeSingle(),
        supabase.from("customer").select("first_name,last_name,phone,email,city").eq("id", d.customer_id).maybeSingle(),
        supabase.from("profile").select("full_name").eq("id", d.salesperson_id).maybeSingle(),
        canCost ? supabase.from("deal_item").select("*").eq("deal_id", id!).order("created_at") : { data: [] },
        supabase.from("contract").select("id,template_version,pdf_path,generated_at,signed_at").eq("deal_id", id!).order("created_at", { ascending: false }),
        canCost ? supabase.from("invoice").select("*").eq("deal_id", id!).order("created_at", { ascending: false }) : { data: [] },
        d.lead_id ? supabase.from("lead").select("id,source_ref,status").eq("id", d.lead_id).maybeSingle() : null,
      ]);
      return { ...d, vehicle: v.data, customer: c.data, seller: s.data, items: (items.data ?? []) as Item[], contracts: contracts.data ?? [], invoices: invoices.data ?? [], lead: lead?.data ?? null };
    },
  });

  const refresh = () => { qc.invalidateQueries({ queryKey: ["deal", id] }); qc.invalidateQueries({ queryKey: ["deals"] }); };
  const err = (e: Error) => toast.error(e.message);
  // Avanzamento con set_deal_status (controlla ruolo e passaggio). Alla firma si genera il contratto,
  // alla consegna la fattura se Fatture in Cloud è attivo con invoice_on = delivered.
  const setStatus = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await supabase.rpc("set_deal_status", { _deal_id: id, _to: status });
      if (error) throw error;
      if (status === "signed") await callFunction("generate-contract", { deal_id: id }).catch((e: Error) => toast.warning(`Contratto da generare: ${e.message}`));
      if (status === "delivered" && canInvoice) {
        const { data: cfg } = await supabase.from("setting").select("value").eq("key", "fatture_in_cloud").maybeSingle();
        if (cfg?.value?.invoice_on === "delivered" && cfg.value.enabled) await callFunction("fic-invoice", { deal_id: id }).catch((e: Error) => toast.warning(`Fattura: ${e.message}`));
      }
    },
    onSuccess: (_d, s) => { toast.success(s === "signed" ? "Firmata: auto venduta, lead vinta, annunci in ritiro" : `Pratica → ${DEAL_STATUS[s][0]}`); refresh(); qc.invalidateQueries({ queryKey: ["lead_open"] }); qc.invalidateQueries({ queryKey: ["vehicle_public"] }); },
    onError: err,
  });
  const addItem = useMutation({
    mutationFn: async () => {
      const amount = parseNum(newItem.amount) ?? 0;
      if (!amount) throw new Error("Inserisci un importo");
      const { error } = await supabase.from("deal_item").insert({ deal_id: id, type: newItem.type, kind: COST.includes(newItem.type) ? "cost" : "revenue", estimated: Math.abs(amount), source: profile?.role ?? "app" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Voce aggiunta"); setNewItem({ type: "insurance", amount: "" }); refresh(); },
    onError: err,
  });
  const setActual = useMutation({
    mutationFn: async ({ itemId, actual }: { itemId: string; actual: number | null }) => {
      const { error } = await supabase.from("deal_item").update({ actual, status: actual == null ? "planned" : "confirmed" }).eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Importo reale salvato"); refresh(); }, onError: err,
  });
  const removeItem = useMutation({
    mutationFn: async (itemId: string) => { const { error } = await supabase.from("deal_item").delete().eq("id", itemId); if (error) throw error; },
    onSuccess: () => { toast.success("Voce rimossa"); refresh(); }, onError: err,
  });
  const contract = useMutation({
    mutationFn: (open: boolean) => callFunction<{ url: string }>("generate-contract", { deal_id: id, open }),
    onSuccess: (data, open) => { if (!open) { toast.success("Contratto generato"); refresh(); } window.open(data.url, "_blank", "noopener"); },
    onError: err,
  });
  const invoice = useMutation({
    mutationFn: () => callFunction<{ dry_run?: boolean }>("fic-invoice", { deal_id: id }),
    onSuccess: (data) => { toast.success(data.dry_run ? "Fattura di prova: totali verificati" : "Fattura creata su Fatture in Cloud"); refresh(); },
    onError: (e: Error) => { toast.error(e.message); refresh(); },
  });

  if (deal.isLoading) return <p className="text-sm text-muted-foreground">Carico…</p>;
  if (deal.error || !deal.data) return <p className="card p-4 text-sm text-destructive-ink">Pratica non trovata o non visibile con il tuo ruolo.</p>;
  const d = deal.data;
  const [label, tone] = DEAL_STATUS[d.status] ?? [d.status, "muted" as Tone];
  const val = (i: Item) => Number(i.actual ?? i.estimated ?? 0);
  const revenue = d.items.filter((i) => i.kind === "revenue").reduce((a, i) => a + val(i), 0);
  const cost = d.items.filter((i) => i.kind === "cost").reduce((a, i) => a + val(i), 0);
  const max = Math.max(1, ...d.items.map(val));
  const stepIdx = STEPS.indexOf(d.status);
  const next = STEPS[stepIdx + 1];
  const fin = (d.financing ?? {}) as { amount?: number; installments?: number; company?: string };
  const trade = (d.trade_in ?? {}) as { value?: number; plate?: string; make?: string; model?: string };

  return (
    <>
      <Link to="/pratiche" className="text-sm font-bold text-primary">‹ Pratiche</Link>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl">{d.vehicle ? `${d.vehicle.make} ${d.vehicle.model}` : "Pratica"}</h1>
          <p className="text-sm text-muted-foreground">{d.vehicle?.plate} · {d.customer ? `${d.customer.first_name} ${d.customer.last_name}` : ""} · {d.seller?.full_name ?? ""}</p>
        </div>
        <Pill tone={tone}>{label}</Pill>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Prezzo" value={fmtEur(d.sale_price)} />
        <Kpi label="Caparra" value={fmtEur(d.deposit)} sub={Number(d.deposit) > 0 ? "auto riservata" : ""} />
        <Kpi label="Finanziamento" value={fin.amount ? fmtEur(fin.amount) : "nessuno"} sub={fin.installments ? `${fin.installments} rate${fin.company ? " · " + fin.company : ""}` : ""} />
        {canCost ? <Kpi label="Margine" value={fmtEur(revenue - cost)} sub={d.items.some((i) => i.actual != null) ? "con importi reali" : "stimato"} accent /> : <Kpi label="Permuta" value={trade.value ? fmtEur(trade.value) : "nessuna"} />}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {canCost && (
          <section className="card p-4">
            <h3 className="text-base">Margine a voci</h3>
            <div className="mt-3 flex flex-col gap-2.5">
              {d.items.map((i) => {
                const n = val(i), neg = i.kind === "cost";
                return (
                  <div key={i.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-sm">
                    <div><b>{ITEM_TYPE[i.type] ?? i.type}</b><div className="text-xs text-muted-foreground">{i.actual != null ? "reale" : "stimato"} · {i.source ?? ""}</div></div>
                    <div className="flex items-center gap-2">
                      <span className={`font-bold tabular-nums ${neg ? "text-destructive-ink" : ""}`}>{neg ? "−" : "+"}{fmtEur(n)}</span>
                      <input type="number" placeholder="reale" defaultValue={i.actual ?? ""} aria-label="Importo reale"
                        onBlur={(e) => { const v = e.target.value === "" ? null : Number(e.target.value); if (v !== i.actual) setActual.mutate({ itemId: i.id, actual: v }); }}
                        className="h-8 w-24 rounded-lg border border-input bg-card px-2 text-right text-xs tabular-nums" />
                      {i.type !== "vehicle_margin" && <button onClick={() => removeItem.mutate(i.id)} className="text-xs text-muted-foreground hover:text-destructive-ink" aria-label="Rimuovi">✕</button>}
                    </div>
                    <div className="col-span-2 h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${neg ? "bg-destructive" : "bg-gradient-primary"}`} style={{ width: `${(n / max) * 100}%` }} /></div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex items-baseline justify-between border-t border-dashed border-border pt-3 text-sm">
              <span className="text-muted-foreground">Ricavi {fmtEur(revenue)} · costi {fmtEur(cost)}</span>
              <b className="font-display text-xl font-extrabold text-primary">{fmtEur(revenue - cost)}</b>
            </div>
            <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); addItem.mutate(); }}>
              <div className="min-w-[140px] flex-1"><Label htmlFor="it">Nuova voce</Label>
                <select id="it" value={newItem.type} onChange={(e) => setNewItem({ ...newItem, type: e.target.value })} className="h-11 w-full rounded-xl border border-input bg-card px-3 text-sm">
                  {[...REVENUE, ...COST].map((t) => <option key={t} value={t}>{ITEM_TYPE[t]}</option>)}
                </select></div>
              <div className="w-28"><Label htmlFor="amt">Importo</Label><Input id="amt" inputMode="decimal" value={newItem.amount} onChange={(e) => setNewItem({ ...newItem, amount: e.target.value })} placeholder="€" /></div>
              <Button type="submit" size="sm" variant="outline" disabled={addItem.isPending}>Aggiungi</Button>
            </form>
          </section>
        )}

        <section className="card p-4">
          <h3 className="text-base">Avanzamento</h3>
          <ul className="mt-3 flex flex-col gap-1.5 border-l-2 border-border pl-4 text-sm">
            {STEPS.map((s, i) => (
              <li key={s} className={`relative before:absolute before:-left-[21px] before:top-1.5 before:h-2.5 before:w-2.5 before:rounded-full before:border-2 before:border-card ${i <= stepIdx ? "before:bg-primary" : "before:bg-border text-muted-foreground"}`}>
                {DEAL_STATUS[s][0]}{i === stepIdx && <span className="ml-2 text-xs text-primary">● in corso</span>}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            {next && d.status !== "cancelled" && <Button size="sm" onClick={() => setStatus.mutate(next)} disabled={setStatus.isPending}>{next === "signed" ? "Segna firmata" : `→ ${DEAL_STATUS[next][0]}`}</Button>}
            {!["closed", "cancelled"].includes(d.status) && <Button size="sm" variant="outline" onClick={() => setStatus.mutate("cancelled")} disabled={setStatus.isPending}>Annulla</Button>}
          </div>
          {next === "signed" && <p className="mt-3 text-xs text-muted-foreground">Alla firma: auto → venduta, lead → vinta, ritiro annunci in outbox, notifica ad amministrazione e F&amp;I.</p>}
          <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Aperta</dt><dd className="text-right font-semibold">{fmtDate(d.created_at)}</dd>
            <dt className="text-muted-foreground">Firmata</dt><dd className="text-right font-semibold">{fmtDate(d.signed_at)}</dd>
            <dt className="text-muted-foreground">Consegnata</dt><dd className="text-right font-semibold">{fmtDate(d.delivered_at)}</dd>
            {d.lead && <><dt className="text-muted-foreground">Lead</dt><dd className="text-right font-semibold"><Link to={`/lead/${d.lead.id}`} className="text-primary">{d.lead.source_ref}</Link></dd></>}
            {trade.value ? <><dt className="text-muted-foreground">Permuta</dt><dd className="text-right font-semibold">{trade.make ?? ""} {trade.model ?? ""} {trade.plate ?? ""} · {fmtEur(trade.value)}</dd></> : null}
            <dt className="text-muted-foreground">Garanzia</dt><dd className="text-right font-semibold">{d.warranty_months ?? 24} mesi</dd>
          </dl>
        </section>

        <section className="card p-4">
          <div className="flex items-center justify-between gap-2"><h3 className="text-base">Contratto</h3>
            <div className="flex gap-2">
              {d.contracts.some((c) => c.pdf_path) && <Button size="sm" variant="ghost" onClick={() => contract.mutate(true)} disabled={contract.isPending}>Apri</Button>}
              <Button size="sm" variant="outline" onClick={() => contract.mutate(false)} disabled={contract.isPending}>Genera</Button>
            </div></div>
          {d.contracts.length ? (
            <ul className="mt-3 text-sm">{d.contracts.map((c) => <li key={c.id} className="flex justify-between border-t border-border py-2 first:border-t-0"><span>{c.pdf_path ? `Modello ${c.template_version}` : "Importi congelati alla firma"} {c.signed_at ? <Pill tone="ok">firmato</Pill> : ""}</span><span className="text-muted-foreground">{c.generated_at ? fmtDateTime(c.generated_at) : "da generare"}</span></li>)}</ul>
          ) : <p className="mt-2 text-sm text-muted-foreground">Nessun contratto generato. Per ora è una bozza HTML da stampare: il modello definitivo arriva con la fase 4.</p>}
        </section>

        {canCost && (
          <section className="card p-4">
            <div className="flex items-center justify-between"><h3 className="text-base">Fatture in Cloud</h3>{canInvoice && <Button size="sm" variant="outline" onClick={() => invoice.mutate()} disabled={invoice.isPending}>{invoice.isPending ? "Invio…" : "Prepara fattura"}</Button>}</div>
            {d.invoices.length ? (
              <ul className="mt-3 text-sm">{d.invoices.map((i: { id: string; kind: string; status: string; number: number | null; numeration: string | null; amount_gross: number | null; created_at: string; last_error: string | null; dry_run: boolean }) => {
                const [l, t] = INV_STATUS[i.status] ?? [i.status, "muted" as Tone];
                return <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-border py-2 first:border-t-0"><div><b>{i.kind === "proforma" ? "Proforma" : i.kind === "credit_note" ? "Nota di credito" : "Fattura"} {i.number ? `${i.number}${i.numeration ?? ""}` : ""}</b><div className="text-xs text-muted-foreground">{fmtDateTime(i.created_at)} · {i.amount_gross ? fmtEur(i.amount_gross) : i.dry_run ? "prova" : ""}{i.last_error ? ` · ${i.last_error}` : ""}</div></div><Pill tone={t}>{l}</Pill></li>;
              })}</ul>
            ) : <p className="mt-2 text-sm text-muted-foreground">Nessuna fattura. "Prepara fattura" costruisce il documento dalla pratica (veicolo in regime del margine, accessori al 22%, caparra incassata) e lo invia a Fatture in Cloud (in prova finché è attiva la modalità prova).</p>}
          </section>
        )}
      </div>
    </>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return <div className="card p-3.5"><div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</div><div className={`mt-0.5 font-display text-xl font-extrabold tabular-nums ${accent ? "text-primary" : ""}`}>{value}</div>{sub && <div className="text-xs text-muted-foreground">{sub}</div>}</div>;
}
