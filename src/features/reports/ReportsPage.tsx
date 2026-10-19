import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { fmtEur } from "@/lib/utils";
import { CHANNEL, LEAD_STATUS } from "@/features/leads/LeadRow";
import { cn } from "@/lib/utils";

const PERIODS: Array<[number, string]> = [[7, "7 giorni"], [30, "30 giorni"], [90, "90 giorni"], [365, "12 mesi"]];

/** Indicatori della sezione 9 della specifica, calcolati dalle viste e dalle tabelle che il ruolo può leggere. */
export function ReportsPage() {
  const [days, setDays] = useState(30);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const q = useQuery({
    queryKey: ["report", days],
    queryFn: async () => {
      const [leads, sellers, stock, margins, yard] = await Promise.all([
        supabase.from("lead").select("channel,status,temperature,assigned_to,response_minutes,reassignment_count,created_at,status_changed_at").gte("created_at", since),
        supabase.from("salesperson_stats").select("*"),
        supabase.from("vehicle_stock").select("status,days_in_stock,purchase_cost,sale_price,list_price,reconditioning_cost"),
        supabase.from("deal_margin").select("status,estimated_margin,actual_margin,sale_price"),
        supabase.from("vehicle_public").select("yard_verified_at,status"),
      ]);
      return { leads: leads.data ?? [], sellers: sellers.data ?? [], stock: stock.data ?? [], margins: margins.data ?? [], yard: yard.data ?? [], stockDenied: Boolean(stock.error) };
    },
  });
  const d = q.data;
  const group = <T,>(rows: T[], key: (r: T) => string) => { const m = new Map<string, number>(); rows.forEach((r) => m.set(key(r), (m.get(key(r)) ?? 0) + 1)); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  const leads = d?.leads ?? [];
  const won = leads.filter((l) => l.status === "won").length, lost = leads.filter((l) => l.status === "lost").length;
  const resp = leads.filter((l) => l.response_minutes != null).map((l) => l.response_minutes as number);
  const avgResp = resp.length ? Math.round(resp.reduce((a, b) => a + b, 0) / resp.length) : null;
  const byChannel = group(leads, (l) => l.channel);
  const byStatus = group(leads, (l) => l.status);
  const stock = d?.stock ?? [];
  const inStock = stock.filter((v) => !["sold", "delivered", "withdrawn"].includes(v.status));
  const stale60 = inStock.filter((v) => Number(v.days_in_stock) > 60).length, stale90 = inStock.filter((v) => Number(v.days_in_stock) > 90).length;
  const stockValue = inStock.reduce((a, v) => a + Number(v.purchase_cost ?? 0) + Number(v.reconditioning_cost ?? 0), 0);
  const margins = (d?.margins ?? []).filter((m) => m.status !== "cancelled");
  const marginTotal = margins.reduce((a, m) => a + Number(m.actual_margin ?? m.estimated_margin ?? 0), 0);
  const unverified = (d?.yard ?? []).filter((v) => !["sold", "delivered"].includes(v.status) && (!v.yard_verified_at || Date.now() - new Date(v.yard_verified_at).getTime() > 7 * 86_400_000)).length;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h1 className="text-2xl">Report</h1><p className="text-sm text-muted-foreground">Lead degli ultimi {days} giorni · stock e pratiche aggiornati a oggi</p></div>
        <div className="flex gap-2">{PERIODS.map(([n, l]) => <button key={n} onClick={() => setDays(n)} className={cn("rounded-full border border-input bg-card px-3.5 py-1.5 text-sm font-semibold", days === n && "border-primary bg-primary text-primary-foreground")}>{l}</button>)}</div>
      </div>
      {q.error && <p className="card p-4 text-sm text-destructive-ink">{(q.error as Error).message}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Lead ricevute" value={String(leads.length)} sub={`${won} vinte · ${lost} perse`} />
        <Kpi label="Conversione" value={leads.length ? Math.round((won / leads.length) * 100) + "%" : "—"} sub="vinte su ricevute" />
        <Kpi label="Risposta media" value={avgResp != null ? `${avgResp} min` : "—"} sub="primo contatto" />
        <Kpi label="Riassegnate" value={String(leads.filter((l) => (l.reassignment_count ?? 0) > 0).length)} sub="almeno una volta" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Bars title="Lead per canale" rows={byChannel.map(([k, n]) => [CHANNEL[k] ?? k, n])} />
        <Bars title="Lead per stato" rows={byStatus.map(([k, n]) => [LEAD_STATUS[k] ?? k, n])} />
      </div>

      <section className="card overflow-hidden">
        <div className="px-4 pb-2 pt-4"><h3 className="text-base">Venditori</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-2">Venditore</th><th className="px-2 py-2 text-right">Lead 30 gg</th><th className="px-2 py-2 text-right">Appuntamenti</th><th className="px-2 py-2 text-right">Vinte 90 gg</th><th className="px-2 py-2 text-right">Chiusura</th><th className="px-4 py-2 text-right">Risposta</th></tr></thead>
            <tbody>{(d?.sellers ?? []).sort((a, b) => Number(b.close_rate_90) - Number(a.close_rate_90)).map((s) => (
              <tr key={s.salesperson_id} className="border-t border-border"><td className="px-4 py-2 font-semibold">{s.full_name}</td><td className="px-2 py-2 text-right tabular-nums">{s.leads_received_30}</td><td className="px-2 py-2 text-right tabular-nums">{s.appointments}</td><td className="px-2 py-2 text-right tabular-nums">{s.wins_90}</td><td className="px-2 py-2 text-right tabular-nums">{Math.round(Number(s.close_rate_90) * 100)}%</td><td className="px-4 py-2 text-right tabular-nums">{s.avg_response_minutes ?? "—"} min</td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Auto in stock" value={String(inStock.length || (d?.yard.length ?? 0))} sub={d?.stockDenied ? "costi non visibili" : `valore ${fmtEur(stockValue)}`} />
        <Kpi label="Ferme" value={`${stale60} / ${stale90}`} sub="oltre 60 / 90 giorni" />
        <Kpi label="Margine pratiche" value={fmtEur(marginTotal)} sub={`${margins.length} pratiche`} accent />
        <Kpi label="Piazzale" value={String(unverified)} sub="posizioni da verificare" />
      </div>
      <p className="text-xs text-muted-foreground">Riepiloghi giornaliero e settimanale via notifica e indicatori sui portali arrivano con i collegamenti veri (fase 7).</p>
    </>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return <div className="card p-3.5"><div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</div><div className={`mt-0.5 font-display text-2xl font-extrabold tabular-nums ${accent ? "text-primary" : ""}`}>{value}</div>{sub && <div className="text-xs text-muted-foreground">{sub}</div>}</div>;
}
function Bars({ title, rows }: { title: string; rows: Array<[string, number]> }) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <section className="card p-4"><h3 className="text-base">{title}</h3>
      <div className="mt-3 flex flex-col gap-2">
        {rows.map(([k, n]) => <div key={k} className="grid grid-cols-[110px_1fr_36px] items-center gap-2 text-sm"><span className="truncate">{k}</span><div className="h-2.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-primary" style={{ width: `${(n / max) * 100}%` }} /></div><span className="text-right font-bold tabular-nums">{n}</span></div>)}
        {rows.length === 0 && <p className="text-sm text-muted-foreground">Nessun dato nel periodo.</p>}
      </div>
    </section>
  );
}
