import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Pill, type Tone } from "@/components/ui/pill";
import { fmtEur, fmtDate } from "@/lib/utils";

export const DEAL_STATUS: Record<string, [string, Tone]> = {
  open: ["Aperta", "muted"], quote_sent: ["Preventivo inviato", "info"], contract_pending: ["Contratto in attesa", "warn"], signed: ["Firmata", "ok"],
  payment_pending: ["Pagamento in attesa", "warn"], transfer_documents: ["Passaggio in corso", "info"], delivered: ["Consegnata", "ok"], closed: ["Chiusa", "muted"], cancelled: ["Annullata", "bad"],
};

export interface DealRow {
  id: string; status: string; sale_price: number | null; deposit: number | null; created_at: string; signed_at: string | null; delivered_at: string | null;
  vehicle_id: string; customer_id: string; salesperson_id: string; lead_id: string | null; financing: Record<string, unknown> | null; trade_in: Record<string, unknown> | null;
  warranty_months: number | null; conclusion_type: string | null;
}

export function DealsPage() {
  const q = useQuery({
    queryKey: ["deals"],
    queryFn: async () => {
      const { data, error } = await supabase.from("deal").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      const deals = (data ?? []) as DealRow[];
      const vIds = [...new Set(deals.map((d) => d.vehicle_id))], cIds = [...new Set(deals.map((d) => d.customer_id))];
      const [v, c, m] = await Promise.all([
        vIds.length ? supabase.from("vehicle_public").select("id,plate,make,model").in("id", vIds) : { data: [] },
        cIds.length ? supabase.from("customer").select("id,first_name,last_name").in("id", cIds) : { data: [] },
        supabase.from("deal_margin").select("deal_id,estimated_margin,actual_margin"),
      ]);
      const vm = new Map((v.data ?? []).map((x) => [x.id, x])), cm = new Map((c.data ?? []).map((x) => [x.id, x])), mm = new Map((m.data ?? []).map((x) => [x.deal_id, x]));
      return deals.map((d) => ({ ...d, vehicle: vm.get(d.vehicle_id), customer: cm.get(d.customer_id), margin: mm.get(d.id) }));
    },
  });
  const rows = q.data ?? [];
  const open = rows.filter((d) => !["closed", "cancelled", "delivered"].includes(d.status));
  const totalMargin = rows.filter((d) => d.status !== "cancelled").reduce((a, d) => a + Number(d.margin?.actual_margin ?? d.margin?.estimated_margin ?? 0), 0);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h1 className="text-2xl">Pratiche</h1><p className="text-sm text-muted-foreground">{open.length} aperte · margine stimato totale {fmtEur(totalMargin)}</p></div>
        <Link to="/pratiche/nuova" className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground shadow-glow">+ Nuova pratica</Link>
      </div>
      {q.error && <p className="card p-4 text-sm text-destructive-ink">{(q.error as Error).message}</p>}
      <section className="card overflow-hidden">
        {rows.map((d) => {
          const [label, tone] = DEAL_STATUS[d.status] ?? [d.status, "muted" as Tone];
          return (
            <Link key={d.id} to={`/pratiche/${d.id}`} className="flex items-center gap-3 border-t border-border px-4 py-3 first:border-t-0 hover:bg-muted">
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold">{d.vehicle ? `${d.vehicle.make} ${d.vehicle.model} · ${d.vehicle.plate}` : "Veicolo"} </div>
                <div className="truncate text-xs text-muted-foreground">{d.customer ? `${d.customer.first_name} ${d.customer.last_name}` : "Cliente"} · {fmtDate(d.created_at)} · {fmtEur(d.sale_price)}</div>
              </div>
              <div className="hidden text-right sm:block"><div className="font-display font-extrabold text-primary tabular-nums">{fmtEur(d.margin?.actual_margin ?? d.margin?.estimated_margin)}</div><div className="text-[10px] text-muted-foreground">margine</div></div>
              <Pill tone={tone}>{label}</Pill>
            </Link>
          );
        })}
        {!q.isLoading && rows.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nessuna pratica.</p>}
      </section>
    </>
  );
}
