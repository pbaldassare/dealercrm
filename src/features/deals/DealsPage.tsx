import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Pill, type Tone } from "@/components/ui/pill";
import { fmtEur, fmtDate } from "@/lib/utils";
import { DataTable, type Column } from "@/components/DataTable";

export const DEAL_STATUS: Record<string, [string, Tone]> = {
  open: ["Aperta", "muted"], quote_sent: ["Preventivo inviato", "info"], contract_pending: ["Contratto in attesa", "warn"], signed: ["Firmata", "ok"],
  payment_pending: ["Pagamento in attesa", "warn"], transfer_documents: ["Passaggio in corso", "info"], delivered: ["Consegnata", "ok"], closed: ["Chiusa", "muted"], cancelled: ["Annullata", "bad"],
};

export interface DealRow {
  id: string; status: string; sale_price: number | null; deposit: number | null; created_at: string; signed_at: string | null; delivered_at: string | null;
  vehicle_id: string; customer_id: string; salesperson_id: string; lead_id: string | null; financing: Record<string, unknown> | null; trade_in: Record<string, unknown> | null;
  warranty_months: number | null; conclusion_type: string | null;
}

const OPEN = (s: string) => !["closed", "cancelled", "delivered"].includes(s);

/** Pratiche: tabella con filtri per stato, margine stimato o reale, export. */
export function DealsPage() {
  const nav = useNavigate();
  const q = useQuery({
    queryKey: ["deals"],
    queryFn: async () => {
      const { data, error } = await supabase.from("deal").select("*, customer:customer_id(first_name,last_name), seller:salesperson_id(full_name)").order("created_at", { ascending: false });
      if (error) throw error;
      const deals = (data ?? []) as unknown as Array<DealRow & { customer: { first_name: string; last_name: string } | null; seller: { full_name: string } | null }>;
      const vIds = [...new Set(deals.map((d) => d.vehicle_id))];
      const [v, m] = await Promise.all([
        vIds.length ? supabase.from("vehicle_public").select("id,plate,make,model").in("id", vIds) : { data: [] },
        supabase.from("deal_margin").select("deal_id,estimated_margin,actual_margin"),
      ]);
      const vm = new Map((v.data ?? []).map((x) => [x.id, x])), mm = new Map((m.data ?? []).map((x) => [x.deal_id, x]));
      return deals.map((d) => ({ ...d, vehicle: vm.get(d.vehicle_id), margin: mm.get(d.id) }));
    },
  });
  type Row = NonNullable<typeof q.data>[number];
  const rows = q.data ?? [];
  const marginOf = (d: Row) => (d.margin ? Number(d.margin.actual_margin ?? d.margin.estimated_margin) : null);
  const totalMargin = rows.filter((d) => d.status !== "cancelled").reduce((a, d) => a + (marginOf(d) ?? 0), 0);

  const columns: Column<Row>[] = [
    { key: "vehicle", header: "Auto", cell: (d) => d.vehicle ? <span><b>{d.vehicle.plate}</b> · {d.vehicle.make} {d.vehicle.model}</span> : "—", value: (d) => d.vehicle?.plate },
    { key: "customer", header: "Cliente", cell: (d) => d.customer ? `${d.customer.first_name} ${d.customer.last_name}` : "—", value: (d) => d.customer ? `${d.customer.last_name} ${d.customer.first_name}` : null },
    { key: "seller", header: "Venditore", cell: (d) => d.seller?.full_name ?? "—", value: (d) => d.seller?.full_name },
    { key: "status", header: "Stato", cell: (d) => { const [l, t] = DEAL_STATUS[d.status] ?? [d.status, "muted" as Tone]; return <Pill tone={t}>{l}</Pill>; }, value: (d) => STEP_ORDER.indexOf(d.status) },
    { key: "price", header: "Prezzo", cell: (d) => fmtEur(d.sale_price), value: (d) => d.sale_price, className: "text-right" },
    { key: "deposit", header: "Caparra", cell: (d) => fmtEur(d.deposit), value: (d) => d.deposit, className: "text-right" },
    { key: "margin", header: "Margine", cell: (d) => <span className="font-bold text-primary">{d.margin ? fmtEur(marginOf(d)) : "—"}</span>, value: (d) => marginOf(d), className: "text-right" },
    { key: "created", header: "Aperta", cell: (d) => fmtDate(d.created_at), value: (d) => d.created_at },
    { key: "signed", header: "Firmata", cell: (d) => fmtDate(d.signed_at), value: (d) => d.signed_at },
  ];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h1 className="text-2xl">Pratiche</h1><p className="text-sm text-muted-foreground">{rows.filter((d) => OPEN(d.status)).length} aperte · margine totale {fmtEur(totalMargin)}</p></div>
        <Link to="/pratiche/nuova" className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground shadow-glow">+ Nuova pratica</Link>
      </div>
      {q.error && <p className="card p-4 text-sm text-destructive-ink">{(q.error as Error).message}</p>}
      <DataTable
        rows={rows} columns={columns} rowKey={(d) => d.id} loading={q.isLoading}
        searchText={(d) => [d.vehicle?.plate, d.vehicle?.make, d.vehicle?.model, d.customer?.first_name, d.customer?.last_name, d.seller?.full_name].join(" ")}
        searchPlaceholder="Cerca targa, cliente, venditore"
        filters={[
          { key: "open", label: "Aperte", test: (d) => OPEN(d.status) },
          { key: "tosign", label: "Da firmare", test: (d) => ["open", "quote_sent", "contract_pending"].includes(d.status) },
          { key: "signed", label: "Firmate, da consegnare", test: (d) => ["signed", "payment_pending", "transfer_documents"].includes(d.status) },
          { key: "done", label: "Consegnate e chiuse", test: (d) => ["delivered", "closed"].includes(d.status) },
          { key: "cancelled", label: "Annullate", test: (d) => d.status === "cancelled" },
        ]}
        initialSort={{ key: "created", dir: "desc" }}
        onRowClick={(d) => nav(`/pratiche/${d.id}`)}
        mobileRow={(d) => {
          const [label, tone] = DEAL_STATUS[d.status] ?? [d.status, "muted" as Tone];
          return (
            <Link to={`/pratiche/${d.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted">
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold">{d.vehicle ? `${d.vehicle.make} ${d.vehicle.model} · ${d.vehicle.plate}` : "Veicolo"}</div>
                <div className="truncate text-xs text-muted-foreground">{d.customer ? `${d.customer.first_name} ${d.customer.last_name}` : "Cliente"} · {fmtDate(d.created_at)} · {fmtEur(d.sale_price)}</div>
              </div>
              <Pill tone={tone}>{label}</Pill>
            </Link>
          );
        }}
        exportName="pratiche"
      />
    </>
  );
}

const STEP_ORDER = ["open", "quote_sent", "contract_pending", "signed", "payment_pending", "transfer_documents", "delivered", "closed", "cancelled"];
