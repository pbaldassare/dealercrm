import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { DataTable, type Column } from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import { Pill, type Tone } from "@/components/ui/pill";
import { fmtDateTime, fmtEur } from "@/lib/utils";
import { VSTATUS } from "@/features/vehicles/VehiclesPage";

export const PORTALS: Record<string, string> = { autoscout24: "AutoScout24", subito: "Subito.it", automobile: "Automobile.it", website: "Sito" };
const LSTATUS: Record<string, [string, Tone]> = { to_publish: ["Da pubblicare", "muted"], publishing: ["In pubblicazione", "info"], published: ["Pubblicato", "ok"], error: ["Errore", "bad"], withdrawn: ["Ritirato", "muted"], suspended: ["Sospeso", "warn"] };
const OSTATUS: Record<string, [string, Tone]> = { pending: ["In coda", "info"], sent: ["Inviata", "ok"], failed: ["Fallita", "bad"] };
const ACTION: Record<string, string> = { publish: "Pubblica", suspend: "Sospendi", withdraw: "Ritira" };

interface Listing { id: string; vehicle_id: string; portal: string; status: string; external_id: string | null; last_synced_at: string | null; last_error: string | null }
interface Veh { id: string; plate: string; make: string; model: string; status: string; days_in_stock: number | null; sale_price: number | null; list_price: number | null }

/**
 * Annunci sui portali: per ogni auto in stock gli annunci con il loro stato e le azioni (pubblica, sospendi, ritira),
 * che passano dall'outbox. Con i portali finti (FEATURE_PORTALS_REAL spento) l'esito arriva entro un minuto.
 */
export function ListingsPage() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const canOutbox = profile?.role === "admin" || profile?.role === "marketing";
  const [portal, setPortal] = useState("autoscout24");

  const q = useQuery({
    queryKey: ["listings"],
    queryFn: async () => {
      const [v, l, o] = await Promise.all([
        supabase.from("vehicle_public").select("id,plate,make,model,status,days_in_stock,sale_price,list_price").not("status", "in", "(delivered,withdrawn)").order("plate"),
        supabase.from("listing").select("id,vehicle_id,portal,status,external_id,last_synced_at,last_error"),
        canOutbox ? supabase.from("outbox").select("id,integration,action,status,attempts,last_error,created_at,payload").order("created_at", { ascending: false }).limit(50) : { data: [] },
      ]);
      if (v.error) throw v.error;
      const byVehicle = new Map<string, Listing[]>();
      (l.data as Listing[] ?? []).forEach((x) => byVehicle.set(x.vehicle_id, [...(byVehicle.get(x.vehicle_id) ?? []), x]));
      return { vehicles: (v.data as Veh[]).map((x) => ({ ...x, listings: byVehicle.get(x.id) ?? [] })), outbox: o.data ?? [] };
    },
    refetchInterval: 20_000,
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["listings"] }); qc.invalidateQueries({ queryKey: ["vehicle"] }); qc.invalidateQueries({ queryKey: ["vehicle_public"] }); };

  const act = useMutation({
    mutationFn: async ({ listingId, action }: { listingId: string; action: string }) => {
      const { error } = await supabase.rpc("queue_listing_action", { _listing_id: listingId, _action: action });
      if (error) throw error;
    },
    onSuccess: (_d, v) => { toast.success(`${ACTION[v.action]}: in coda, esito entro un minuto`); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const add = useMutation({
    mutationFn: async (vehicleId: string) => {
      const { data, error } = await supabase.from("listing").insert({ vehicle_id: vehicleId, portal, status: "to_publish" }).select("id").single();
      if (error) throw error.message.includes("duplicate") ? new Error(`Annuncio su ${PORTALS[portal]} già presente`) : error;
      const { error: e2 } = await supabase.rpc("queue_listing_action", { _listing_id: data.id, _action: "publish" });
      if (e2) throw e2;
    },
    onSuccess: () => { toast.success(`Pubblicazione su ${PORTALS[portal]} in coda`); refresh(); },
    onError: (e: Error) => { toast.error(e.message); refresh(); },
  });

  type Row = NonNullable<typeof q.data>["vehicles"][number];
  const columns: Column<Row>[] = [
    { key: "plate", header: "Auto", cell: (v) => <Link to={`/auto/${v.id}`} onClick={(e) => e.stopPropagation()} className="hover:text-primary"><b>{v.plate}</b> · {v.make} {v.model}</Link>, value: (v) => v.plate },
    { key: "status", header: "Stato auto", cell: (v) => { const [l, t] = VSTATUS[v.status] ?? [v.status, "muted" as Tone]; return <Pill tone={t}>{l}</Pill>; }, value: (v) => VSTATUS[v.status]?.[0] },
    { key: "price", header: "Prezzo", cell: (v) => fmtEur(v.sale_price ?? v.list_price), value: (v) => v.sale_price ?? v.list_price, className: "text-right" },
    { key: "days", header: "Giorni", cell: (v) => v.days_in_stock ?? 0, value: (v) => v.days_in_stock, className: "text-right" },
    {
      key: "listings", header: "Annunci", cell: (v) => (
        <div className="flex flex-col gap-1.5">
          {v.listings.map((l) => {
            const [label, tone] = LSTATUS[l.status] ?? [l.status, "muted" as Tone];
            return (
              <div key={l.id} className="flex flex-wrap items-center gap-1.5">
                <span className="w-28 font-semibold">{PORTALS[l.portal] ?? l.portal}</span><Pill tone={tone}>{label}</Pill>
                {l.last_error && <span className="text-xs text-destructive-ink">{l.last_error}</span>}
                {["to_publish", "withdrawn", "suspended", "error"].includes(l.status) && <Button size="sm" variant="ghost" onClick={() => act.mutate({ listingId: l.id, action: "publish" })} disabled={act.isPending}>Pubblica</Button>}
                {l.status === "published" && <Button size="sm" variant="ghost" onClick={() => act.mutate({ listingId: l.id, action: "suspend" })} disabled={act.isPending}>Sospendi</Button>}
                {["published", "suspended"].includes(l.status) && <Button size="sm" variant="ghost" onClick={() => act.mutate({ listingId: l.id, action: "withdraw" })} disabled={act.isPending}>Ritira</Button>}
              </div>
            );
          })}
          {v.listings.length === 0 && <span className="text-muted-foreground">nessuno</span>}
        </div>
      ),
      value: (v) => v.listings.filter((l) => l.status === "published").length,
    },
    { key: "add", header: "", cell: (v) => !v.listings.some((l) => l.portal === portal) && ["ready", "published", "reserved"].includes(v.status)
        ? <Button size="sm" variant="outline" onClick={() => add.mutate(v.id)} disabled={add.isPending}>+ {PORTALS[portal]}</Button> : null },
  ];

  const vehicles = q.data?.vehicles ?? [];
  return (
    <>
      <div><h1 className="text-2xl">Annunci</h1><p className="text-sm text-muted-foreground">Portali finti finché non si accendono i collegamenti veri: l'esito arriva entro un minuto</p></div>
      {q.error && <p className="card p-4 text-sm text-destructive-ink">{(q.error as Error).message}</p>}
      <DataTable
        rows={vehicles} columns={columns} rowKey={(v) => v.id} loading={q.isLoading}
        searchText={(v) => `${v.plate} ${v.make} ${v.model}`} searchPlaceholder="Cerca targa o modello"
        toolbar={<label className="flex items-center gap-2 text-sm">Nuovo annuncio su<select value={portal} onChange={(e) => setPortal(e.target.value)} className="h-9 rounded-lg border border-input bg-card px-2">{Object.entries(PORTALS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>}
        filters={[
          { key: "ready", label: "Pronte da pubblicare", test: (v) => v.status === "ready" },
          { key: "none", label: "Senza annunci", test: (v) => ["ready", "published", "reserved"].includes(v.status) && !v.listings.some((l) => l.status === "published") },
          { key: "error", label: "In errore", test: (v) => v.listings.some((l) => l.status === "error") },
          { key: "sold", label: "Vendute con annunci attivi", test: (v) => ["sold", "delivering"].includes(v.status) && v.listings.some((l) => ["published", "suspended"].includes(l.status)) },
        ]}
        initialSort={{ key: "plate", dir: "asc" }}
        exportName="annunci"
      />
      {canOutbox && (
        <section className="card overflow-hidden">
          <div className="px-4 pb-2 pt-4"><h3 className="text-base">Outbox · ultime 50 azioni verso l'esterno</h3></div>
          {(q.data?.outbox ?? []).map((o: { id: string; integration: string; action: string; status: string; attempts: number; last_error: string | null; created_at: string }) => {
            const [l, t] = OSTATUS[o.status] ?? [o.status, "muted" as Tone];
            return (
              <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2 text-sm">
                <span><b>{PORTALS[o.integration] ?? o.integration}</b> · {ACTION[o.action] ?? o.action} · {fmtDateTime(o.created_at)}{o.attempts > 1 ? ` · ${o.attempts} tentativi` : ""}{o.last_error ? <span className="block text-xs text-destructive-ink">{o.last_error}</span> : null}</span>
                <Pill tone={t}>{l}</Pill>
              </div>
            );
          })}
          {(q.data?.outbox ?? []).length === 0 && <p className="px-4 pb-4 text-sm text-muted-foreground">Nessuna azione.</p>}
        </section>
      )}
    </>
  );
}
