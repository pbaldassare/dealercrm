import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { DataTable, type Column } from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import { Pill, type Tone } from "@/components/ui/pill";
import { fmtDate, fmtDateTime, fmtEur } from "@/lib/utils";

export const VSTATUS: Record<string, [string, Tone]> = {
  incoming: ["In arrivo", "muted"], received: ["Ricevuta", "info"], reconditioning: ["In lavorazione", "warn"], ready: ["Pronta", "info"],
  published: ["Pubblicata", "ok"], reserved: ["Riservata", "hot"], sold: ["Venduta", "primary"], delivering: ["In consegna", "info"],
  delivered: ["Consegnata", "muted"], withdrawn: ["Ritirata", "muted"],
};
export const WORD: Record<string, string> = {
  petrol: "Benzina", diesel: "Diesel", hybrid: "Ibrida", electric: "Elettrica", lpg: "GPL", methane: "Metano",
  sedan: "Berlina", suv: "SUV", city_car: "City car", station_wagon: "Station wagon", minivan: "Monovolume", coupe: "Coupé", other: "Altro",
  manual: "Manuale", automatic: "Automatico", in_yard: "In piazzale", workshop: "In officina", test_drive: "In prova", off_site: "Fuori sede",
  used: "Usato", km0: "Km 0", new: "Nuovo",
};
const w = (k: string | null | undefined) => (k ? WORD[k] ?? k : "—");
const COST_ROLES = ["admin", "owner", "sales_manager", "used_manager", "accounting", "finance_insurance"];
const IN_STOCK = (s: string) => !["sold", "delivered", "withdrawn"].includes(s);
const WORK: Record<string, string> = { bodywork: "Carrozzeria", mechanical: "Meccanica", cleaning: "Pulizia", documents: "Documenti" };
const WORK_STATUS: Record<string, string> = { planned: "Prevista", in_progress: "In corso", done: "Fatta" };
const LISTING: Record<string, [string, Tone]> = { to_publish: ["Da pubblicare", "muted"], publishing: ["In pubblicazione", "info"], published: ["Pubblicato", "ok"], error: ["Errore", "bad"], withdrawn: ["Ritirato", "muted"], suspended: ["Sospeso", "warn"] };

interface VehicleRow {
  id: string; plate: string; make: string; model: string; trim: string | null; first_registration: string | null; mileage_km: number | null;
  fuel_type: string | null; body_type: string | null; color: string | null; status: string; list_price: number | null; sale_price: number | null;
  days_in_stock: number | null; yard_status: string | null; yard_verified_at: string | null; supplier_id: string | null; yard_slot_id: string | null;
  kind: string | null; vin: string | null; gearbox: string | null; power_kw: number | null; previous_owners: number | null; notes: string | null; entry_date: string | null;
  purchase_cost?: number | null; reconditioning_cost?: number | null;
}

/** Stock veicoli: tabella con filtri per stato e giacenza; costi e margine solo per i ruoli che li vedono. */
export function VehiclesPage() {
  const nav = useNavigate();
  const { profile } = useAuth();
  const canCost = !!profile && COST_ROLES.includes(profile.role);
  const canWrite = profile?.role === "admin" || profile?.role === "used_manager";

  const list = useQuery({
    queryKey: ["vehicle_public", canCost],
    queryFn: async () => {
      const { data, error } = await supabase.from("vehicle_public").select("*").order("plate");
      if (error) throw error;
      const rows = (data ?? []) as VehicleRow[];
      if (!canCost) return rows;
      const { data: s } = await supabase.from("vehicle_stock").select("id,purchase_cost,reconditioning_cost");
      const costs = new Map((s ?? []).map((x) => [x.id, x]));
      return rows.map((r) => ({ ...r, purchase_cost: costs.get(r.id)?.purchase_cost ?? null, reconditioning_cost: costs.get(r.id)?.reconditioning_cost ?? null }));
    },
  });

  const price = (v: VehicleRow) => v.sale_price ?? v.list_price;
  const margin = (v: VehicleRow) => (price(v) != null && v.purchase_cost != null ? Number(price(v)) - Number(v.purchase_cost) - Number(v.reconditioning_cost ?? 0) : null);
  const columns: Column<VehicleRow>[] = [
    { key: "plate", header: "Targa", cell: (v) => <span className="font-bold tracking-wide">{v.plate}</span>, value: (v) => v.plate },
    { key: "model", header: "Veicolo", cell: (v) => `${v.make} ${v.model} ${v.trim ?? ""}`, value: (v) => `${v.make} ${v.model}` },
    { key: "year", header: "Anno", cell: (v) => v.first_registration?.slice(0, 4) ?? "—", value: (v) => v.first_registration },
    { key: "km", header: "Km", cell: (v) => (v.mileage_km ?? 0).toLocaleString("it-IT"), value: (v) => v.mileage_km, className: "text-right" },
    { key: "fuel", header: "Alimentazione", cell: (v) => w(v.fuel_type), value: (v) => w(v.fuel_type) },
    { key: "price", header: "Prezzo", cell: (v) => fmtEur(price(v)), value: (v) => price(v), className: "text-right" },
    ...(canCost ? [
      { key: "cost", header: "Costo", cell: (v: VehicleRow) => fmtEur(v.purchase_cost), value: (v: VehicleRow) => v.purchase_cost, className: "text-right" },
      { key: "margin", header: "Margine", cell: (v: VehicleRow) => <span className="font-bold text-primary">{fmtEur(margin(v))}</span>, value: (v: VehicleRow) => margin(v), className: "text-right" },
    ] : []),
    { key: "status", header: "Stato", cell: (v) => { const [l, t] = VSTATUS[v.status] ?? [v.status, "muted" as Tone]; return <Pill tone={t}>{l}</Pill>; }, value: (v) => VSTATUS[v.status]?.[0] ?? v.status },
    { key: "days", header: "Giorni", cell: (v) => <span className={Number(v.days_in_stock) > 60 && IN_STOCK(v.status) ? "font-bold text-warning-ink" : ""}>{v.days_in_stock ?? 0}</span>, value: (v) => v.days_in_stock, className: "text-right" },
    { key: "yard", header: "Posizione", cell: (v) => w(v.yard_status), value: (v) => w(v.yard_status) },
  ];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h1 className="text-2xl">Auto</h1><p className="text-sm text-muted-foreground">{(list.data ?? []).filter((v) => IN_STOCK(v.status)).length} in stock</p></div>
        {canWrite && <Link to="/auto/nuova" className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground shadow-glow">+ Nuova auto</Link>}
      </div>
      {list.error && <p className="card p-4 text-sm text-destructive-ink">{(list.error as Error).message}</p>}
      <DataTable
        rows={list.data ?? []} columns={columns} rowKey={(v) => v.id} loading={list.isLoading}
        searchText={(v) => `${v.plate} ${v.make} ${v.model} ${v.trim ?? ""} ${v.vin ?? ""} ${v.color ?? ""}`}
        searchPlaceholder="Cerca targa, marca, modello, telaio"
        filters={[
          { key: "stock", label: "In stock", test: (v) => IN_STOCK(v.status) },
          { key: "published", label: "Pubblicate", test: (v) => v.status === "published" },
          { key: "prep", label: "In preparazione", test: (v) => ["incoming", "received", "reconditioning", "ready"].includes(v.status) },
          { key: "reserved", label: "Riservate", test: (v) => v.status === "reserved" },
          { key: "stale60", label: "Oltre 60 giorni", test: (v) => IN_STOCK(v.status) && Number(v.days_in_stock) > 60 },
          { key: "sold", label: "Vendute", test: (v) => ["sold", "delivering", "delivered"].includes(v.status) },
        ]}
        initialSort={{ key: "plate", dir: "asc" }}
        onRowClick={(v) => nav(`/auto/${v.id}`)}
        mobileRow={(v) => {
          const [label, tone] = VSTATUS[v.status] ?? [v.status, "muted" as Tone];
          return (
            <Link to={`/auto/${v.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-center font-display text-[11px] font-extrabold leading-tight">{v.plate.slice(0, 2)}<br />{v.plate.slice(2, 5)}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold">{v.make} {v.model} {v.trim ?? ""}</div>
                <div className="truncate text-xs text-muted-foreground">{v.plate} · {(v.mileage_km ?? 0).toLocaleString("it-IT")} km · {v.days_in_stock ?? 0} gg · {fmtEur(price(v))}</div>
              </div>
              <Pill tone={tone}>{label}</Pill>
            </Link>
          );
        }}
        exportName="auto"
      />
    </>
  );
}

/** Scheda veicolo: dati, storico, lavorazioni, annunci; costi e margine per i ruoli abilitati; stato e modifica per usato e admin. */
export function VehicleDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const canCost = !!profile && COST_ROLES.includes(profile.role);
  const canWrite = profile?.role === "admin" || profile?.role === "used_manager";
  const [nextStatus, setNextStatus] = useState("");

  const v = useQuery({
    queryKey: ["vehicle", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("vehicle_public").select("*").eq("id", id!).single();
      if (error) throw error;
      const [sup, ev, stock, works, listings] = await Promise.all([
        data.supplier_id ? supabase.from("supplier").select("id,name").eq("id", data.supplier_id).maybeSingle() : null,
        supabase.from("vehicle_event").select("*").eq("vehicle_id", id!).order("at", { ascending: false }),
        canCost ? supabase.from("vehicle_stock").select("purchase_cost,reconditioning_cost").eq("id", id!).maybeSingle() : null,
        supabase.from("vehicle_work").select("id,kind,status,cost,started_at,ended_at,notes").eq("vehicle_id", id!).order("created_at"),
        supabase.from("listing").select("id,portal,status,external_id,last_synced_at,last_error").eq("vehicle_id", id!).order("portal"),
      ]);
      return {
        ...(data as VehicleRow), supplier: sup?.data ?? null, events: ev.data ?? [], stock: stock?.data ?? null,
        works: works.data ?? [], listings: listings.data ?? [],
      };
    },
  });
  const status = useMutation({
    mutationFn: async (to: string) => {
      const { error } = await supabase.rpc("change_vehicle_status", { _vehicle_id: id, _to_status: to, _payload: { source: "app" } });
      if (error) throw error;
    },
    onSuccess: (_d, to) => { toast.success(`Stato → ${VSTATUS[to][0]}`); setNextStatus(""); qc.invalidateQueries({ queryKey: ["vehicle"] }); qc.invalidateQueries({ queryKey: ["vehicle_public"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (v.isLoading) return <p className="text-sm text-muted-foreground">Carico…</p>;
  if (v.error || !v.data) return <p className="card p-4 text-sm text-destructive-ink">Auto non trovata.</p>;
  const d = v.data;
  const [label, tone] = VSTATUS[d.status] ?? [d.status, "muted" as Tone];
  const price = d.sale_price ?? d.list_price ?? 0;
  const margin = d.stock ? price - Number(d.stock.purchase_cost ?? 0) - Number(d.stock.reconditioning_cost ?? 0) : null;

  return (
    <>
      <Link to="/auto" className="text-sm font-bold text-primary">‹ Auto</Link>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h1 className="text-2xl">{d.make} {d.model} {d.trim ?? ""}</h1>
          <p className="text-sm text-muted-foreground">{d.plate} · {d.first_registration?.slice(0, 4)} · {(d.mileage_km ?? 0).toLocaleString("it-IT")} km · {w(d.fuel_type)}</p></div>
        <div className="flex items-center gap-2">
          <Pill tone={tone}>{label}</Pill>
          {canWrite && <Link to={`/auto/${d.id}/modifica`}><Button size="sm" variant="outline">Modifica</Button></Link>}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="card p-4"><h3 className="text-base">Scheda</h3>
          <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Tipo</dt><dd className="text-right font-semibold">{w(d.kind)} · {w(d.body_type)}</dd>
            <dt className="text-muted-foreground">Telaio</dt><dd className="text-right font-semibold">{d.vin ?? "—"}</dd>
            <dt className="text-muted-foreground">Cambio · potenza</dt><dd className="text-right font-semibold">{w(d.gearbox)} · {d.power_kw ? `${d.power_kw} kW` : "—"}</dd>
            <dt className="text-muted-foreground">Colore · proprietari</dt><dd className="text-right font-semibold">{d.color ?? "—"} · {d.previous_owners ?? "—"}</dd>
            <dt className="text-muted-foreground">Fornitore</dt><dd className="text-right font-semibold">{d.supplier ? <Link to={`/fornitori/${d.supplier.id}`} className="text-primary">{d.supplier.name}</Link> : "—"}</dd>
            <dt className="text-muted-foreground">Ingresso · giorni in stock</dt><dd className="text-right font-semibold">{fmtDate(d.entry_date)} · {d.days_in_stock ?? 0} {Number(d.days_in_stock) > 60 && <Pill tone="warn">oltre 60</Pill>}</dd>
            <dt className="text-muted-foreground">Posizione</dt><dd className="text-right font-semibold">{w(d.yard_status)} · verificata {fmtDate(d.yard_verified_at)}</dd>
            <dt className="text-muted-foreground">Prezzo</dt><dd className="text-right font-semibold">{fmtEur(price)}</dd>
            {d.stock && <>
              <dt className="text-muted-foreground">Costo acquisto</dt><dd className="text-right font-semibold">{fmtEur(d.stock.purchase_cost)}</dd>
              <dt className="text-muted-foreground">Ricondizionamento</dt><dd className="text-right font-semibold">{fmtEur(d.stock.reconditioning_cost)}</dd>
              <dt className="text-muted-foreground">Margine stimato</dt><dd className="text-right font-semibold text-primary">{fmtEur(margin)}</dd>
            </>}
          </dl>
          {d.notes && <p className="mt-3 rounded-xl bg-secondary p-3 text-sm">{d.notes}</p>}
          {canWrite && (
            <form className="mt-4 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (nextStatus) status.mutate(nextStatus); }}>
              <select value={nextStatus} onChange={(e) => setNextStatus(e.target.value)} aria-label="Nuovo stato" className="h-9 rounded-lg border border-input bg-card px-2 text-sm">
                <option value="">Cambia stato…</option>
                {Object.entries(VSTATUS).filter(([k]) => k !== d.status).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <Button size="sm" type="submit" disabled={!nextStatus || status.isPending}>Applica</Button>
            </form>
          )}
        </section>
        <section className="card p-4"><h3 className="text-base">Storico</h3>
          <ul className="mt-3 flex max-h-[420px] flex-col gap-2 overflow-y-auto border-l-2 border-border pl-4 text-sm">
            {d.events.map((e: { id: string; at: string; type: string; to_status: string | null; payload: Record<string, unknown> | null }) => (
              <li key={e.id}>
                {e.type === "status_change" ? `Stato → ${VSTATUS[e.to_status ?? ""]?.[0] ?? e.to_status}` : e.type === "work" ? `Lavorazione: ${WORK[String(e.payload?.kind ?? "")] ?? ""}` : e.type === "lead" ? `Lead ${String(e.payload?.source_ref ?? "")}` : e.type === "yard_position" ? "Posizione aggiornata" : e.type === "test_drive" ? "Prova su strada" : e.type}
                <span className="block text-xs text-muted-foreground">{fmtDateTime(e.at)}</span>
              </li>
            ))}
            {d.events.length === 0 && <li className="text-muted-foreground">Nessun evento registrato.</li>}
          </ul>
        </section>
        <section className="card p-4"><h3 className="text-base">Lavorazioni</h3>
          <ul className="mt-2 text-sm">
            {d.works.map((x: { id: string; kind: string; status: string; cost: number | null; started_at: string | null; notes: string | null }) => (
              <li key={x.id} className="flex justify-between gap-2 border-t border-border py-2 first:border-t-0">
                <span><b>{WORK[x.kind] ?? x.kind}</b> · {WORK_STATUS[x.status] ?? x.status}{x.notes ? ` · ${x.notes}` : ""}</span>
                <span className="text-muted-foreground">{canCost && x.cost != null ? fmtEur(x.cost) : fmtDate(x.started_at)}</span>
              </li>
            ))}
            {d.works.length === 0 && <li className="text-muted-foreground">Nessuna lavorazione.</li>}
          </ul>
        </section>
        <section className="card p-4"><h3 className="text-base">Annunci</h3>
          <ul className="mt-2 text-sm">
            {d.listings.map((x: { id: string; portal: string; status: string; external_id: string | null; last_synced_at: string | null; last_error: string | null }) => {
              const [l, t] = LISTING[x.status] ?? [x.status, "muted" as Tone];
              return (
                <li key={x.id} className="flex items-center justify-between gap-2 border-t border-border py-2 first:border-t-0">
                  <span><b className="capitalize">{x.portal}</b>{x.external_id ? ` · ${x.external_id}` : ""}{x.last_error ? <span className="block text-xs text-destructive-ink">{x.last_error}</span> : null}</span>
                  <Pill tone={t}>{l}</Pill>
                </li>
              );
            })}
            {d.listings.length === 0 && <li className="text-muted-foreground">Nessun annuncio.</li>}
          </ul>
        </section>
      </div>
      <p className="text-xs text-muted-foreground">Foto e check delle condizioni arrivano con la fase 2.</p>
    </>
  );
}
