import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Crosshair, Grid3x3, Map as MapIcon, PenLine } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/ui/pill";
import { cn, fmtDate } from "@/lib/utils";
import { currentPosition, ENV_MAP_ID, MAPS_KEY, type LatLng } from "@/lib/maps";
import { YardMap, type MapSlot, type MapZone, type SlotState } from "./YardMap";

interface Slot { id: string; code: string; zone_id: string; lat: number | null; lng: number | null }
interface Zone { id: string; code: string; name: string | null; geometry: { type?: string; coordinates?: number[][][] } | null }
interface Veh { id: string; plate: string; make: string; model: string; status: string; yard_slot_id: string | null; yard_status: string | null; yard_verified_at: string | null; days_in_stock: number | null }
interface MapsSetting { map_id?: string | null; map_type?: string; default_zoom?: number; snap_radius_m?: number; stale_position_days?: number }

const MILANO: LatLng = { lat: 45.4642, lng: 9.19 };
const WORKSHOP_ZONE = "W";

/**
 * Piazzale (sezioni 8 e 12): mappa satellitare con gli stalli se c'è la chiave Google Maps, altrimenti griglia per zona.
 * Registrare la posizione: scegli la targa, poi tocca lo stallo o un punto della mappa (aggancio allo stallo entro snap_radius_m).
 * Il ruolo piazzale e l'admin disegnano gli stalli: aggiungono toccando la mappa, trascinano per correggere, rinominano dalla scheda.
 */
export function YardPage() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const role = profile?.role;
  const canMove = role === "admin" || role === "yard" || role === "used_manager";
  const canDraw = role === "admin" || role === "yard";
  const [view, setView] = useState<"map" | "grid">(MAPS_KEY ? "map" : "grid");
  const [selected, setSelected] = useState<string | null>(null);
  const [moving, setMoving] = useState<Veh | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [drawZone, setDrawZone] = useState<string | null>(null);
  const [me, setMe] = useState<(LatLng & { accuracy: number }) | null>(null);
  const [pending, setPending] = useState<{ point: LatLng; zoneId: string } | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);

  const q = useQuery({
    queryKey: ["yard"],
    queryFn: async () => {
      const [z, s, v, m, d] = await Promise.all([
        supabase.from("yard_zone").select("id,code,name,geometry").order("code"),
        supabase.from("yard_slot").select("id,code,zone_id,lat,lng").order("code"),
        supabase.from("vehicle_public").select("id,plate,make,model,status,yard_slot_id,yard_status,yard_verified_at,days_in_stock").not("status", "in", "(sold,delivered,withdrawn)"),
        supabase.from("setting").select("value").eq("key", "maps").maybeSingle(),
        supabase.from("dealership").select("id,lat,lng").maybeSingle(),
      ]);
      if (z.error) throw z.error;
      return {
        zones: (z.data ?? []) as Zone[], slots: (s.data ?? []) as Slot[], vehicles: (v.data ?? []) as Veh[],
        maps: (m.data?.value ?? {}) as MapsSetting, dealership: d.data as { id: string; lat: number | null; lng: number | null } | null,
      };
    },
    refetchInterval: 30_000,
  });

  // Aggiornamento tra telefoni: chi cambia qualcosa avvisa gli altri, che rileggono (i dati passano sempre dalla RLS)
  const channel = useRef<ReturnType<typeof supabase.channel> | null>(null);
  useEffect(() => {
    const ch = supabase.channel("dealercrm-yard").on("broadcast", { event: "changed" }, () => qc.invalidateQueries({ queryKey: ["yard"] })).subscribe();
    channel.current = ch;
    return () => { void supabase.removeChannel(ch); };
  }, [qc]);
  const changed = () => {
    qc.invalidateQueries({ queryKey: ["yard"] });
    qc.invalidateQueries({ queryKey: ["vehicle"] });
    void channel.current?.send({ type: "broadcast", event: "changed", payload: {} });
  };
  const fail = (e: Error) => toast.error(e.message);

  const d = q.data;
  const cfg = d?.maps ?? {};
  const snapM = cfg.snap_radius_m ?? 15;
  const staleDays = cfg.stale_position_days ?? 7;
  const isStale = (v: Veh) => !v.yard_verified_at || Date.now() - new Date(v.yard_verified_at).getTime() > staleDays * 86_400_000;
  const bySlot = useMemo(() => new Map((d?.vehicles ?? []).filter((v) => v.yard_slot_id).map((v) => [v.yard_slot_id as string, v])), [d]);
  const zoneById = useMemo(() => new Map((d?.zones ?? []).map((z) => [z.id, z])), [d]);
  const unplaced = (d?.vehicles ?? []).filter((v) => !v.yard_slot_id);

  const move = useMutation({
    mutationFn: async ({ vehicle, slot }: { vehicle: Veh; slot: Slot }) => {
      const workshop = zoneById.get(slot.zone_id)?.code === WORKSHOP_ZONE;
      const { error } = await supabase.rpc("set_vehicle_yard_position", { _vehicle_id: vehicle.id, _slot_id: slot.id, _yard_status: workshop ? "workshop" : "in_yard" });
      if (error) throw error;
      return { vehicle, slot };
    },
    onSuccess: ({ vehicle, slot }) => { toast.success(`${vehicle.plate} → stallo ${slot.code}`); setMoving(null); setSelected(slot.id); setPending(null); changed(); },
    onError: fail,
  });
  const confirmPos = useMutation({
    mutationFn: async (v: Veh) => {
      const { error } = await supabase.rpc("set_vehicle_yard_position", { _vehicle_id: v.id, _slot_id: v.yard_slot_id, _yard_status: v.yard_status ?? "in_yard" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Posizione confermata"); changed(); },
    onError: fail,
  });

  // Stalli: nuovo (codice progressivo nella zona), spostato, rinominato
  const nextCode = (zoneId: string) => {
    const zone = zoneById.get(zoneId)!;
    const nums = (d?.slots ?? []).filter((s) => s.zone_id === zoneId).map((s) => Number(s.code.split("-").pop()) || 0);
    return `${zone.code}-${String(Math.max(0, ...nums) + 1).padStart(2, "0")}`;
  };
  const addSlot = useMutation({
    mutationFn: async ({ point, zoneId }: { point: LatLng; zoneId: string }) => {
      const { data, error } = await supabase.from("yard_slot").insert({ zone_id: zoneId, code: nextCode(zoneId), lat: point.lat, lng: point.lng }).select("id,code,zone_id,lat,lng").single();
      if (error) throw error;
      return data as Slot;
    },
    onSuccess: (slot) => {
      toast.success(`Stallo ${slot.code} aggiunto`);
      setPending(null);
      if (moving) move.mutate({ vehicle: moving, slot }); else { setSelected(slot.id); changed(); }
    },
    onError: fail,
  });
  const updateSlot = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Slot> }) => {
      const { error } = await supabase.from("yard_slot").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => changed(),
    onError: (e: Error) => { toast.error(e.message.includes("duplicate") ? "Esiste già uno stallo con questo codice nella zona" : e.message); qc.invalidateQueries({ queryKey: ["yard"] }); },
  });
  const setCenter = useMutation({
    mutationFn: async (p: LatLng) => {
      const { error } = await supabase.from("dealership").update({ lat: p.lat, lng: p.lng }).eq("id", d!.dealership!.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Centro del piazzale salvato"); changed(); },
    onError: fail,
  });

  // Tocco sulla mappa: disegno di uno stallo, oppure posizione dell'auto che si sta spostando
  async function onMapClick(point: LatLng) {
    if (!d) return;
    if (drawing) {
      const zoneId = drawZone ?? (await nearestZone(point)) ?? d.zones[0]?.id;
      if (zoneId) addSlot.mutate({ point, zoneId });
      return;
    }
    if (!moving) { setSelected(null); setPending(null); return; }
    const { data, error } = await supabase.rpc("yard_slot_nearest", { _lat: point.lat, _lng: point.lng, _radius_m: snapM });
    if (error) return fail(error);
    const hit = (data ?? [])[0] as { slot_id: string; code: string; zone_code: string; distance_m: number } | undefined;
    if (hit && hit.distance_m <= snapM) return placeOn(hit.slot_id);
    const zoneId = hit ? d.zones.find((z) => z.code === hit.zone_code)?.id : d.zones[0]?.id;
    if (canDraw && zoneId) setPending({ point, zoneId });
    else toast(`Nessuno stallo entro ${snapM} m: tocca uno stallo`);
  }
  async function nearestZone(point: LatLng) {
    const { data } = await supabase.rpc("yard_slot_nearest", { _lat: point.lat, _lng: point.lng, _radius_m: 1e6 });
    const hit = (data ?? [])[0] as { zone_code: string } | undefined;
    return d?.zones.find((z) => z.code === hit?.zone_code)?.id ?? null;
  }
  function placeOn(slotId: string) {
    const slot = d?.slots.find((s) => s.id === slotId);
    if (!slot || !moving) return;
    const there = bySlot.get(slotId);
    if (there && there.id !== moving.id) return toast.error(`Lo stallo ${slot.code} è occupato da ${there.plate}`);
    move.mutate({ vehicle: moving, slot });
  }
  function onSlotClick(id: string) {
    if (moving) return placeOn(id);
    setPending(null);
    setSelected(id);
  }

  // "Sono qui": posizione del telefono; sotto i 20 m di accuratezza vale come tocco sulla mappa
  const [locating, setLocating] = useState(false);
  async function locate() {
    setLocating(true);
    try {
      const pos = await currentPosition();
      setMe(pos);
      mapRef.current?.panTo(pos);
      if (pos.accuracy > 20) toast.warning(`Posizione imprecisa (± ${Math.round(pos.accuracy)} m): tocca la mappa nel punto giusto`);
      else if (moving) await onMapClick(pos);
    } catch (e) { fail(e as Error); } finally { setLocating(false); }
  }

  if (q.error) return <p className="card p-4 text-sm text-destructive-ink">{(q.error as Error).message}</p>;

  const center: LatLng = d?.dealership?.lat != null && d.dealership.lng != null
    ? { lat: d.dealership.lat, lng: d.dealership.lng }
    : centroid((d?.slots ?? []).filter((s) => s.lat != null)) ?? MILANO;
  const slotState = (s: Slot): SlotState => {
    const v = bySlot.get(s.id);
    if (!v) return "free";
    if (isStale(v)) return "stale";
    return v.yard_status === "workshop" || zoneById.get(s.zone_id)?.code === WORKSHOP_ZONE ? "workshop" : "occupied";
  };
  const mapSlots: MapSlot[] = (d?.slots ?? []).filter((s) => s.lat != null && s.lng != null)
    .map((s) => ({ id: s.id, code: s.code, lat: s.lat!, lng: s.lng!, state: slotState(s), label: bySlot.get(s.id)?.plate ?? s.code }));
  const mapZones: MapZone[] = (d?.zones ?? []).map((z) => ({ id: z.id, code: z.code, ring: (z.geometry?.coordinates?.[0] ?? []).map(([lng, lat]) => ({ lat, lng })) }));
  const sel = selected ? bySlot.get(selected) : undefined;
  const selSlot = d?.slots.find((s) => s.id === selected);
  const mapId = ENV_MAP_ID || cfg.map_id || "DEMO_MAP_ID";

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl">Piazzale</h1>
          <p className="text-sm text-muted-foreground">
            {view === "map" ? "Tocca uno stallo per la scheda" : MAPS_KEY ? "Vista a griglia" : "Vista a griglia · la mappa si attiva con la chiave Google Maps"}
            {view === "map" && mapId === "DEMO_MAP_ID" && " · Map ID di prova"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {MAPS_KEY && (
            <div className="flex rounded-full border border-input bg-card p-0.5">
              <button onClick={() => setView("map")} className={cn("flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold", view === "map" && "bg-primary text-primary-foreground")}><MapIcon className="h-4 w-4" />Mappa</button>
              <button onClick={() => { setView("grid"); setDrawing(false); }} className={cn("flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold", view === "grid" && "bg-primary text-primary-foreground")}><Grid3x3 className="h-4 w-4" />Griglia</button>
            </div>
          )}
          {canMove && unplaced.length > 0 && !moving && <Button size="sm" variant="outline" onClick={() => { setMoving(unplaced[0]); setDrawing(false); }}>Posiziona {unplaced[0].plate}</Button>}
        </div>
      </div>

      {moving && (
        <div className="card border-primary p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h3 className="text-base">Posiziona {moving.plate}</h3>
              <p className="text-sm text-muted-foreground">{moving.make} {moving.model}: {view === "map" ? `tocca lo stallo o il punto sulla mappa (aggancio entro ${snapM} m), oppure usa "Sono qui"` : "tocca lo stallo di destinazione"}.</p></div>
            <Button size="sm" variant="ghost" onClick={() => { setMoving(null); setPending(null); }}>Annulla</Button>
          </div>
          {unplaced.length > 1 && <div className="mt-2 flex flex-wrap gap-1.5">{unplaced.map((v) => <button key={v.id} onClick={() => setMoving(v)} className={cn("rounded-full border border-input px-3 py-1 text-xs font-bold", moving.id === v.id && "border-primary bg-primary text-primary-foreground")}>{v.plate}</button>)}</div>}
        </div>
      )}

      {view === "map" && d && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={locate} disabled={locating}><Crosshair className="h-4 w-4" />{locating ? "Cerco…" : "Sono qui"}</Button>
            {canDraw && <Button size="sm" variant={drawing ? "primary" : "outline"} onClick={() => { setDrawing(!drawing); setMoving(null); setPending(null); }}><PenLine className="h-4 w-4" />{drawing ? "Fine disegno" : "Disegna stalli"}</Button>}
            {role === "admin" && d.dealership && <Button size="sm" variant="ghost" onClick={() => { const c = mapRef.current?.getCenter(); if (c) setCenter.mutate(c.toJSON()); }}>Salva il centro della mappa come sede</Button>}
          </div>
          {drawing && (
            <div className="card p-3 text-sm">
              <p className="text-muted-foreground">Tocca la mappa per aggiungere uno stallo, trascina un segnaposto per correggerlo. Zona del nuovo stallo:</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button onClick={() => setDrawZone(null)} className={cn("rounded-full border border-input px-3 py-1 text-xs font-bold", drawZone === null && "border-primary bg-primary text-primary-foreground")}>la più vicina</button>
                {d.zones.map((z) => <button key={z.id} onClick={() => setDrawZone(z.id)} className={cn("rounded-full border border-input px-3 py-1 text-xs font-bold", drawZone === z.id && "border-primary bg-primary text-primary-foreground")}>{z.code === WORKSHOP_ZONE ? "Officina" : `Zona ${z.code}`}</button>)}
              </div>
            </div>
          )}
          <YardMap
            center={center} zoom={cfg.default_zoom ?? 19} mapId={mapId} mapType={cfg.map_type ?? "satellite"}
            slots={mapSlots} zones={mapZones} selectedId={selected} draggable={drawing} me={me}
            onSlotClick={onSlotClick} onMapClick={onMapClick}
            onSlotMoved={(id, p) => updateSlot.mutate({ id, patch: { lat: p.lat, lng: p.lng } })}
            onReady={(m) => { mapRef.current = m; }}
          />
        </>
      )}

      {pending && (
        <div className="card border-primary p-4 animate-fade-in">
          <p className="text-sm">Nessuno stallo entro {snapM} m da questo punto.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => addSlot.mutate(pending)} disabled={addSlot.isPending}>Crea {nextCode(pending.zoneId)} qui{moving ? ` e metti ${moving.plate}` : ""}</Button>
            <Button size="sm" variant="ghost" onClick={() => setPending(null)}>Annulla</Button>
          </div>
        </div>
      )}

      {selSlot && !moving && (
        <SlotCard
          key={selSlot.id} slot={selSlot} vehicle={sel} zone={zoneById.get(selSlot.zone_id)} stale={sel ? isStale(sel) : false} staleDays={staleDays}
          canMove={canMove} canDraw={canDraw} busy={confirmPos.isPending}
          onConfirm={() => sel && confirmPos.mutate(sel)}
          onMove={() => { if (sel) { setMoving(sel); setDrawing(false); } }}
          onRename={(code) => updateSlot.mutate({ id: selSlot.id, patch: { code } }, { onSuccess: () => toast.success(`Stallo rinominato in ${code}`) })}
          onClose={() => setSelected(null)}
        />
      )}

      {view === "grid" && d?.zones.map((z) => {
        const slots = d.slots.filter((s) => s.zone_id === z.id);
        const shop = z.code === WORKSHOP_ZONE;
        return (
          <section key={z.id} className="card p-4">
            <div className="flex items-center justify-between"><h3 className="text-base">{shop ? "Officina" : `Zona ${z.code}`}{z.name && !shop && <span className="ml-2 text-sm font-medium text-muted-foreground">{z.name}</span>}</h3><Pill>{slots.filter((s) => bySlot.has(s.id)).length}/{slots.length}</Pill></div>
            <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-2">
              {slots.map((s) => {
                const v = bySlot.get(s.id);
                if (moving) {
                  return v ? <div key={s.id} className="aspect-square rounded-xl bg-muted p-1 text-center text-[10px] font-bold text-muted-foreground opacity-50"><div className="mt-2">{v.plate}</div></div>
                    : <button key={s.id} onClick={() => placeOn(s.id)} className="aspect-square rounded-xl border-2 border-dashed border-primary text-xs font-bold text-primary">{s.code}</button>;
                }
                const st = slotState(s);
                return (
                  <button key={s.id} onClick={() => v ? setSelected(s.id) : toast(`Stallo ${s.code} libero`)}
                    className={cn("flex aspect-square flex-col items-center justify-center rounded-xl p-1 text-center text-[10px] font-bold",
                      st === "free" ? "border-[1.5px] border-dashed border-input text-muted-foreground" : st === "workshop" ? "bg-warning/15 text-warning-ink" : st === "stale" ? "bg-destructive/10 text-destructive-ink" : "bg-primary/10 text-primary",
                      selected === s.id && "outline outline-[3px] outline-offset-2 outline-primary")}>
                    {v ? <><span className="text-[11px] leading-tight">{v.plate}</span><span className="font-medium opacity-80">{v.make.split(" ")[0]}</span></> : s.code}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      {unplaced.length > 0 && <p className="text-xs text-muted-foreground">Senza posizione: {unplaced.map((v) => v.plate).join(", ")}</p>}
      <p className="text-xs text-muted-foreground">Legenda: verde libero · teal occupato · arancione in officina · rosso posizione non verificata da più di {staleDays} giorni.</p>
    </>
  );
}

function SlotCard({ slot, vehicle, zone, stale, staleDays, canMove, canDraw, busy, onConfirm, onMove, onRename, onClose }: {
  slot: Slot; vehicle?: Veh; zone?: Zone; stale: boolean; staleDays: number; canMove: boolean; canDraw: boolean; busy: boolean;
  onConfirm: () => void; onMove: () => void; onRename: (code: string) => void; onClose: () => void;
}) {
  const [code, setCode] = useState(slot.code);
  return (
    <div className="card p-4 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          {vehicle ? <h3 className="text-base">{vehicle.make} {vehicle.model}</h3> : <h3 className="text-base">Stallo {slot.code} libero</h3>}
          <p className="text-sm text-muted-foreground">
            {vehicle ? `${vehicle.plate} · ` : ""}stallo {slot.code} · {zone?.code === WORKSHOP_ZONE ? "officina" : `zona ${zone?.code ?? "?"}`}
            {vehicle && <> · {vehicle.days_in_stock ?? 0} gg in stock · verificata {fmtDate(vehicle.yard_verified_at)}</>}
          </p>
          {stale && <Pill tone="warn" className="mt-1">da verificare: oltre {staleDays} giorni</Pill>}
        </div>
        <div className="flex flex-wrap gap-2">
          {vehicle && <Link to={`/auto/${vehicle.id}`}><Button size="sm" variant="outline">Scheda</Button></Link>}
          {vehicle && canMove && <Button size="sm" onClick={onConfirm} disabled={busy}>Conferma posizione</Button>}
          {vehicle && canMove && <Button size="sm" variant="outline" onClick={onMove}>Sposta</Button>}
          <Button size="sm" variant="ghost" onClick={onClose}>Chiudi</Button>
        </div>
      </div>
      {canDraw && (
        <form className="mt-3 flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); const c = code.trim().toUpperCase(); if (c && c !== slot.code) onRename(c); }}>
          <span className="text-xs text-muted-foreground">Codice stallo</span>
          <Input value={code} onChange={(e) => setCode(e.target.value)} className="h-9 w-28" aria-label="Codice stallo" />
          <Button size="sm" variant="outline" type="submit">Rinomina</Button>
        </form>
      )}
    </div>
  );
}

function centroid(points: Array<{ lat: number | null; lng: number | null }>): LatLng | null {
  if (!points.length) return null;
  return { lat: points.reduce((a, p) => a + p.lat!, 0) / points.length, lng: points.reduce((a, p) => a + p.lng!, 0) / points.length };
}
