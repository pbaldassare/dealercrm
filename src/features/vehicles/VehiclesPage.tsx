import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Pill, type Tone } from "@/components/ui/pill";
import { fmtDate, fmtDateTime, fmtEur } from "@/lib/utils";

export const VSTATUS: Record<string, [string, Tone]> = {
  incoming: ["In arrivo", "muted"], received: ["Ricevuta", "info"], reconditioning: ["In lavorazione", "warn"], ready: ["Pronta", "info"],
  published: ["Pubblicata", "ok"], reserved: ["Riservata", "hot"], sold: ["Venduta", "primary"], delivering: ["In consegna", "info"],
  delivered: ["Consegnata", "muted"], withdrawn: ["Ritirata", "muted"],
};
const WORD: Record<string, string> = { petrol: "Benzina", diesel: "Diesel", hybrid: "Ibrida", electric: "Elettrica", lpg: "GPL", methane: "Metano", sedan: "Berlina", suv: "SUV", city_car: "City car", station_wagon: "Station wagon", minivan: "Monovolume", coupe: "Coupé", in_yard: "In piazzale", workshop: "In officina", test_drive: "In prova", off_site: "Fuori sede" };
const w = (k: string | null | undefined) => (k ? WORD[k] ?? k : "—");

interface VehiclePublic {
  id: string; plate: string; make: string; model: string; trim: string | null; first_registration: string | null; mileage_km: number | null;
  fuel_type: string | null; body_type: string | null; color: string | null; status: string; list_price: number | null; sale_price: number | null;
  days_in_stock: number | null; yard_status: string | null; yard_verified_at: string | null; supplier_id: string | null;
}

/** La targa si normalizza come nel DB: maiuscole, senza spazi. */
const normPlate = (s: string) => s.replace(/\s/g, "").toUpperCase();

export function VehiclesPage() {
  const [q, setQ] = useState("");
  const list = useQuery({
    queryKey: ["vehicle_public"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vehicle_public").select("*").order("plate");
      if (error) throw error;
      return (data ?? []) as VehiclePublic[];
    },
  });
  const needle = normPlate(q);
  const rows = (list.data ?? []).filter((v) => !needle || v.plate.includes(needle) || `${v.make} ${v.model}`.toUpperCase().includes(needle));

  return (
    <>
      <div><h1 className="text-2xl">Auto</h1><p className="text-sm text-muted-foreground">{list.data?.length ?? "…"} in stock</p></div>
      <label className="flex items-center gap-2 rounded-full border border-input bg-card px-4 py-1.5">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca per targa" className="h-9 flex-1 bg-transparent text-base font-bold uppercase tracking-wider outline-none placeholder:font-medium placeholder:normal-case placeholder:tracking-normal" />
      </label>
      {list.error && <p className="card p-4 text-sm text-destructive-ink">{(list.error as Error).message}</p>}
      <section className="card overflow-hidden">
        {rows.map((v) => {
          const [label, tone] = VSTATUS[v.status] ?? [v.status, "muted" as Tone];
          return (
            <Link key={v.id} to={`/auto/${v.id}`} className="flex items-center gap-3 border-t border-border px-4 py-3 first:border-t-0 hover:bg-muted">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-center font-display text-[11px] font-extrabold leading-tight">{v.plate.slice(0, 2)}<br />{v.plate.slice(2, 5)}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold">{v.make} {v.model} {v.trim ?? ""}</div>
                <div className="truncate text-xs text-muted-foreground">{v.plate} · {(v.mileage_km ?? 0).toLocaleString("it-IT")} km · {v.days_in_stock ?? 0} gg · {fmtEur(v.sale_price ?? v.list_price)}</div>
              </div>
              <Pill tone={tone}>{label}</Pill>
            </Link>
          );
        })}
        {!list.isLoading && rows.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nessuna auto con questa targa.</p>}
      </section>
    </>
  );
}

export function VehicleDetailPage() {
  const { id } = useParams();
  const { profile } = useAuth();
  const canCost = profile && ["admin", "owner", "sales_manager", "used_manager", "accounting", "finance_insurance"].includes(profile.role);

  const v = useQuery({
    queryKey: ["vehicle", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("vehicle_public").select("*").eq("id", id!).single();
      if (error) throw error;
      const [sup, ev, stock] = await Promise.all([
        data.supplier_id ? supabase.from("supplier").select("name").eq("id", data.supplier_id).maybeSingle() : null,
        supabase.from("vehicle_event").select("*").eq("vehicle_id", id!).order("at"),
        canCost ? supabase.from("vehicle_stock").select("purchase_cost,reconditioning_cost").eq("id", id!).maybeSingle() : null,
      ]);
      return { ...(data as VehiclePublic), supplier: sup?.data?.name ?? null, events: ev.data ?? [], stock: stock?.data ?? null };
    },
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
        <Pill tone={tone}>{label}</Pill>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="card p-4"><h3 className="text-base">Scheda</h3>
          <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Carrozzeria</dt><dd className="text-right font-semibold">{w(d.body_type)}</dd>
            <dt className="text-muted-foreground">Colore</dt><dd className="text-right font-semibold">{d.color ?? "—"}</dd>
            <dt className="text-muted-foreground">Fornitore</dt><dd className="text-right font-semibold">{d.supplier ?? "—"}</dd>
            <dt className="text-muted-foreground">Giorni in stock</dt><dd className="text-right font-semibold">{d.days_in_stock ?? 0} {Number(d.days_in_stock) > 60 && <Pill tone="warn">oltre 60</Pill>}</dd>
            <dt className="text-muted-foreground">Posizione</dt><dd className="text-right font-semibold">{w(d.yard_status)} · verificata {fmtDate(d.yard_verified_at)}</dd>
            <dt className="text-muted-foreground">Prezzo</dt><dd className="text-right font-semibold">{fmtEur(price)}</dd>
            {d.stock && <>
              <dt className="text-muted-foreground">Costo acquisto</dt><dd className="text-right font-semibold">{fmtEur(d.stock.purchase_cost)}</dd>
              <dt className="text-muted-foreground">Ricondizionamento</dt><dd className="text-right font-semibold">{fmtEur(d.stock.reconditioning_cost)}</dd>
              <dt className="text-muted-foreground">Margine stimato</dt><dd className="text-right font-semibold text-primary">{fmtEur(margin)}</dd>
            </>}
          </dl>
        </section>
        <section className="card p-4"><h3 className="text-base">Storico</h3>
          <ul className="mt-3 flex flex-col gap-2 border-l-2 border-border pl-4 text-sm">
            {d.events.map((e: { id: string; at: string; type: string; to_status: string | null; payload: Record<string, unknown> | null }) => (
              <li key={e.id} className="relative before:absolute before:-left-[21px] before:top-1.5 before:h-2.5 before:w-2.5 before:rounded-full before:border-2 before:border-card before:bg-primary">
                {e.type === "status_change" ? `Stato → ${VSTATUS[e.to_status ?? ""]?.[0] ?? e.to_status}` : e.type === "work" ? `Lavorazione: ${String(e.payload?.kind ?? "")}` : e.type === "lead" ? `Lead ${String(e.payload?.source_ref ?? "")}` : e.type === "yard_position" ? "Posizione aggiornata" : e.type}
                <span className="block text-xs text-muted-foreground">{fmtDateTime(e.at)}</span>
              </li>
            ))}
            {d.events.length === 0 && <li className="text-muted-foreground">Nessun evento registrato.</li>}
          </ul>
        </section>
      </div>
      <p className="text-xs text-muted-foreground">Foto, check delle condizioni e annunci arrivano con la fase 2.</p>
    </>
  );
}
