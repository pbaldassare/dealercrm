import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { DataTable, type Column } from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import { Pill, type Tone } from "@/components/ui/pill";
import { fmtDate, fmtDateTime, fmtEur, parseNum } from "@/lib/utils";
import { FUEL, PHASE, WORK, WORK_STATUS } from "./conditions";
import { AlertTriangle } from "lucide-react";

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
const LISTING: Record<string, [string, Tone]> = { to_publish: ["Da pubblicare", "muted"], publishing: ["In pubblicazione", "info"], published: ["Pubblicato", "ok"], error: ["Errore", "bad"], withdrawn: ["Ritirato", "muted"], suspended: ["Sospeso", "warn"] };

interface WorkRow { id: string; kind: string; status: string; cost: number | null; started_at: string | null; ended_at: string | null; notes: string | null }
interface WorkDraft { id: string | null; kind: string; status: string; cost: string; notes: string }

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

  const alerts = useQuery({
    queryKey: ["vehicle_alert"],
    queryFn: async () => (await supabase.from("vehicle_alert").select("vehicle_id,code,severity,message,days")).data ?? [],
  });
  const alertsBy = new Map<string, Array<{ message: string; severity: string }>>();
  (alerts.data ?? []).forEach((a) => alertsBy.set(a.vehicle_id, [...(alertsBy.get(a.vehicle_id) ?? []), a]));
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
    { key: "alerts", header: "Allerte", cell: (v) => { const a = alertsBy.get(v.id); return a ? <span title={a.map((x) => x.message).join("\n")} className={a.some((x) => x.severity === "bad") ? "inline-flex items-center gap-1 font-bold text-destructive-ink" : "inline-flex items-center gap-1 font-bold text-warning-ink"}><AlertTriangle className="h-4 w-4" />{a.length}</span> : null; }, value: (v) => alertsBy.get(v.id)?.length ?? 0 },
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
          { key: "alerts", label: "Con allerte", test: (v) => alertsBy.has(v.id) },
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
  const canCheck = !!profile && ["admin", "used_manager", "reconditioning", "yard"].includes(profile.role);
  const canWork = !!profile && ["admin", "used_manager", "reconditioning"].includes(profile.role);
  const [nextStatus, setNextStatus] = useState("");
  const [work, setWork] = useState<WorkDraft | null>(null);

  const v = useQuery({
    queryKey: ["vehicle", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("vehicle_public").select("*").eq("id", id!).single();
      if (error) throw error;
      const [sup, ev, stock, works, listings] = await Promise.all([
        data.supplier_id ? supabase.from("supplier").select("id,name").eq("id", data.supplier_id).maybeSingle() : null,
        supabase.from("vehicle_event").select("*").eq("vehicle_id", id!).order("at", { ascending: false }),
        canCost ? supabase.from("vehicle_stock").select("purchase_cost,reconditioning_cost").eq("id", id!).maybeSingle() : null,
        supabase.from("vehicle_work_list").select("id,kind,status,cost,started_at,ended_at,notes").eq("vehicle_id", id!).order("created_at"),
        supabase.from("listing").select("id,portal,status,external_id,last_synced_at,last_error").eq("vehicle_id", id!).order("portal"),
      ]);
      const [conds, alerts] = await Promise.all([
        supabase.from("vehicle_condition").select("id,phase,taken_at,mileage_km,fuel_level,ai_review").eq("vehicle_id", id!).order("taken_at", { ascending: false }),
        supabase.from("vehicle_alert").select("code,severity,message,days").eq("vehicle_id", id!),
      ]);
      return {
        ...(data as VehicleRow), supplier: sup?.data ?? null, events: ev.data ?? [], stock: stock?.data ?? null,
        works: (works.data ?? []) as WorkRow[], listings: listings.data ?? [], conditions: conds.data ?? [], alerts: alerts.data ?? [],
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

  const saveWork = useMutation({
    mutationFn: async (w: WorkDraft) => {
      const { error } = await supabase.rpc("save_vehicle_work", { _id: w.id, _vehicle_id: id, _kind: w.kind, _status: w.status, _cost: parseNum(w.cost), _notes: w.notes });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Lavorazione salvata"); setWork(null); qc.invalidateQueries({ queryKey: ["vehicle"] }); qc.invalidateQueries({ queryKey: ["vehicle_stock"] }); },
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
      {d.alerts.length > 0 && (
        <div className="card flex flex-col gap-1.5 border-warning p-4 text-sm">
          {d.alerts.map((a) => <div key={a.code} className={a.severity === "bad" ? "font-bold text-destructive-ink" : "font-semibold text-warning-ink"}><AlertTriangle className="mr-1.5 inline h-4 w-4" />{a.message}{a.days != null ? ` (${a.days} gg)` : ""}</div>)}
        </div>
      )}
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
        <section className="card p-4">
          <div className="flex items-center justify-between gap-2"><h3 className="text-base">Check delle condizioni</h3>
            {canCheck && <Link to={`/auto/${d.id}/check`}><Button size="sm">Nuovo check</Button></Link>}</div>
          <ul className="mt-2 text-sm">
            {d.conditions.map((c: { id: string; phase: string; taken_at: string; mileage_km: number | null; fuel_level: string | null; ai_review: unknown }) => (
              <li key={c.id} className="border-t border-border py-2 first:border-t-0">
                <Link to={`/auto/${d.id}/check/${c.id}`} className="flex items-center justify-between gap-2 hover:text-primary">
                  <span><b>{PHASE[c.phase] ?? c.phase}</b> · {fmtDateTime(c.taken_at)} · {c.mileage_km?.toLocaleString("it-IT") ?? "—"} km · {c.fuel_level ? FUEL[c.fuel_level] : "—"}</span>
                  {c.ai_review ? <Pill tone="info">revisione IA</Pill> : null}
                </Link>
              </li>
            ))}
            {d.conditions.length === 0 && <li className="text-muted-foreground">Nessun check{["received", "reconditioning"].includes(d.status) ? ": il check di ingresso va fatto entro 24 ore" : ""}.</li>}
          </ul>
        </section>
        <section className="card p-4">
          <div className="flex items-center justify-between gap-2"><h3 className="text-base">Lavorazioni</h3>
            {canWork && !work && <Button size="sm" variant="outline" onClick={() => setWork({ id: null, kind: "bodywork", status: "planned", cost: "", notes: "" })}>+ Lavorazione</Button>}</div>
          {work && (
            <form className="mt-3 space-y-2 rounded-xl border border-border p-3" onSubmit={(e) => { e.preventDefault(); saveWork.mutate(work); }}>
              <div className="grid grid-cols-2 gap-2">
                <select aria-label="Tipo" value={work.kind} onChange={(e) => setWork({ ...work, kind: e.target.value })} className="h-10 rounded-lg border border-input bg-card px-2 text-sm">{Object.entries(WORK).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                <select aria-label="Stato" value={work.status} onChange={(e) => setWork({ ...work, status: e.target.value })} className="h-10 rounded-lg border border-input bg-card px-2 text-sm">{Object.entries(WORK_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                <input aria-label="Costo" placeholder={work.id && !canCost ? "costo (lascia vuoto per non cambiarlo)" : "costo €"} inputMode="decimal" value={work.cost} onChange={(e) => setWork({ ...work, cost: e.target.value })} className="h-10 rounded-lg border border-input bg-card px-2 text-sm" />
                <input aria-label="Note" placeholder="note" value={work.notes} onChange={(e) => setWork({ ...work, notes: e.target.value })} className="h-10 rounded-lg border border-input bg-card px-2 text-sm" />
              </div>
              <div className="flex gap-2"><Button size="sm" type="submit" disabled={saveWork.isPending}>Salva</Button><Button size="sm" variant="ghost" type="button" onClick={() => setWork(null)}>Annulla</Button></div>
            </form>
          )}
          <ul className="mt-2 text-sm">
            {d.works.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-2 border-t border-border py-2 first:border-t-0">
                <span><b>{WORK[x.kind] ?? x.kind}</b> · {WORK_STATUS[x.status] ?? x.status}{x.notes ? ` · ${x.notes}` : ""}<span className="block text-xs text-muted-foreground">{x.started_at ? `dal ${fmtDate(x.started_at)}` : "da iniziare"}{x.ended_at ? ` al ${fmtDate(x.ended_at)}` : ""}</span></span>
                <span className="flex items-center gap-2">
                  {canCost && x.cost != null && <span className="text-muted-foreground">{fmtEur(x.cost)}</span>}
                  {canWork && x.status !== "done" && <Button size="sm" variant="ghost" onClick={() => saveWork.mutate({ id: x.id, kind: x.kind, status: x.status === "planned" ? "in_progress" : "done", cost: "", notes: x.notes ?? "" })} disabled={saveWork.isPending}>{x.status === "planned" ? "Inizia" : "Fatta"}</Button>}
                  {canWork && <Button size="sm" variant="ghost" onClick={() => setWork({ id: x.id, kind: x.kind, status: x.status, cost: canCost && x.cost != null ? String(x.cost) : "", notes: x.notes ?? "" })}>Modifica</Button>}
                </span>
              </li>
            ))}
            {d.works.length === 0 && !work && <li className="text-muted-foreground">Nessuna lavorazione.</li>}
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
    </>
  );
}
