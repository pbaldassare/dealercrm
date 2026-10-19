import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { cn, fmtDate } from "@/lib/utils";

interface Slot { id: string; code: string; zone_id: string }
interface Zone { id: string; code: string; name: string | null }
interface Veh { id: string; plate: string; make: string; model: string; status: string; yard_slot_id: string | null; yard_status: string | null; yard_verified_at: string | null; days_in_stock: number | null }

/**
 * Piazzale a griglia: funziona sempre, anche senza chiave Google Maps.
 * La mappa satellitare (sezione 12 della specifica) si aggiunge sopra questa schermata quando ci sono Map ID e coordinate.
 */
export function YardPage() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const canWrite = profile && ["yard", "admin", "used_manager", "sales_manager", "reconditioning"].includes(profile.role);
  const [selected, setSelected] = useState<string | null>(null);
  const [moving, setMoving] = useState<Veh | null>(null);

  const q = useQuery({
    queryKey: ["yard"],
    queryFn: async () => {
      const [z, s, v, m] = await Promise.all([
        supabase.from("yard_zone").select("id,code,name").order("code"),
        supabase.from("yard_slot").select("id,code,zone_id").order("code"),
        supabase.from("vehicle_public").select("id,plate,make,model,status,yard_slot_id,yard_status,yard_verified_at,days_in_stock").not("status", "in", "(sold,delivered,withdrawn)"),
        supabase.from("setting").select("value").eq("key", "maps").maybeSingle(),
      ]);
      if (z.error) throw z.error;
      return { zones: (z.data ?? []) as Zone[], slots: (s.data ?? []) as Slot[], vehicles: (v.data ?? []) as Veh[], maps: (m.data?.value ?? {}) as { map_id?: string; stale_position_days?: number } };
    },
  });
  const move = useMutation({
    mutationFn: async ({ vehicleId, slotId, yardStatus }: { vehicleId: string; slotId: string; yardStatus: string }) => {
      const { error } = await supabase.rpc("set_vehicle_yard_position", { _vehicle_id: vehicleId, _slot_id: slotId, _yard_status: yardStatus });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Posizione registrata"); setMoving(null); setSelected(null); qc.invalidateQueries({ queryKey: ["yard"] }); qc.invalidateQueries({ queryKey: ["vehicle"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.error) return <p className="card p-4 text-sm text-destructive-ink">{(q.error as Error).message}</p>;
  const d = q.data;
  const bySlot = new Map((d?.vehicles ?? []).filter((v) => v.yard_slot_id).map((v) => [v.yard_slot_id as string, v]));
  const staleDays = d?.maps.stale_position_days ?? 7;
  const isStale = (v: Veh) => !v.yard_verified_at || Date.now() - new Date(v.yard_verified_at).getTime() > staleDays * 86_400_000;
  const sel = selected ? bySlot.get(selected) : null;
  const selSlot = d?.slots.find((s) => s.id === selected);
  const unplaced = (d?.vehicles ?? []).filter((v) => !v.yard_slot_id);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h1 className="text-2xl">Piazzale</h1><p className="text-sm text-muted-foreground">{d?.maps.map_id ? "Vista a griglia" : "Vista a griglia · la mappa satellitare si attiva con Map ID e chiave Google Maps"}</p></div>
        {canWrite && unplaced.length > 0 && !moving && <Button size="sm" variant="outline" onClick={() => setMoving(unplaced[0])}>Posiziona {unplaced[0].plate}</Button>}
      </div>

      {moving && (
        <div className="card border-primary p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h3 className="text-base">Sposta {moving.plate}</h3><p className="text-sm text-muted-foreground">{moving.make} {moving.model}: tocca lo stallo di destinazione.</p></div>
            <Button size="sm" variant="ghost" onClick={() => setMoving(null)}>Annulla</Button>
          </div>
          {unplaced.length > 1 && <div className="mt-2 flex flex-wrap gap-1.5">{unplaced.map((v) => <button key={v.id} onClick={() => setMoving(v)} className={cn("rounded-full border border-input px-3 py-1 text-xs font-bold", moving.id === v.id && "border-primary bg-primary text-primary-foreground")}>{v.plate}</button>)}</div>}
        </div>
      )}

      {sel && selSlot && !moving && (
        <div className="card p-4 animate-fade-in">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h3 className="text-base">{sel.make} {sel.model}</h3><p className="text-sm text-muted-foreground">{sel.plate} · stallo {selSlot.code} · {sel.days_in_stock ?? 0} gg in stock · verificata {fmtDate(sel.yard_verified_at)} {isStale(sel) && <Pill tone="warn">da verificare</Pill>}</p></div>
            <div className="flex flex-wrap gap-2">
              <Link to={`/auto/${sel.id}`}><Button size="sm" variant="outline">Scheda</Button></Link>
              {canWrite && <Button size="sm" onClick={() => move.mutate({ vehicleId: sel.id, slotId: selSlot.id, yardStatus: sel.yard_status ?? "in_yard" })} disabled={move.isPending}>Conferma posizione</Button>}
              {canWrite && <Button size="sm" variant="outline" onClick={() => setMoving(sel)}>Sposta</Button>}
              <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>Chiudi</Button>
            </div>
          </div>
        </div>
      )}

      {d?.zones.map((z) => {
        const slots = d.slots.filter((s) => s.zone_id === z.id);
        const shop = z.code === "W";
        return (
          <section key={z.id} className="card p-4">
            <div className="flex items-center justify-between"><h3 className="text-base">{shop ? "Officina" : `Zona ${z.code}`}{z.name && <span className="ml-2 text-sm font-medium text-muted-foreground">{z.name}</span>}</h3><Pill>{slots.filter((s) => bySlot.has(s.id)).length}/{slots.length}</Pill></div>
            <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-2">
              {slots.map((s) => {
                const v = bySlot.get(s.id);
                if (moving) {
                  return v ? <div key={s.id} className="aspect-square rounded-xl bg-muted p-1 text-center text-[10px] font-bold text-muted-foreground opacity-50"><div className="mt-2">{v.plate}</div></div>
                    : <button key={s.id} onClick={() => move.mutate({ vehicleId: moving.id, slotId: s.id, yardStatus: shop ? "workshop" : "in_yard" })} className="aspect-square rounded-xl border-2 border-dashed border-primary text-xs font-bold text-primary">{s.code}</button>;
                }
                return (
                  <button key={s.id} onClick={() => v ? setSelected(s.id) : toast(`Stallo ${s.code} libero`)}
                    className={cn("flex aspect-square flex-col items-center justify-center rounded-xl p-1 text-center text-[10px] font-bold", v ? (shop ? "bg-warning/15 text-warning-ink" : isStale(v) ? "bg-destructive/10 text-destructive-ink" : "bg-primary/10 text-primary") : "border-[1.5px] border-dashed border-input text-muted-foreground", selected === s.id && "outline outline-[3px] outline-offset-2 outline-primary")}>
                    {v ? <><span className="text-[11px] leading-tight">{v.plate}</span><span className="font-medium opacity-80">{v.make.split(" ")[0]}</span></> : s.code}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
      {unplaced.length > 0 && <p className="text-xs text-muted-foreground">Senza posizione: {unplaced.map((v) => v.plate).join(", ")}</p>}
      <p className="text-xs text-muted-foreground">Legenda: teal in piazzale · arancione in officina · rosso posizione non verificata da più di {staleDays} giorni.</p>
    </>
  );
}
