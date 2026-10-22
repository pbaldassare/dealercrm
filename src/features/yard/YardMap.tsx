import { useEffect, useRef, useState } from "react";
import { loadMaps, tokenColor, type LatLng } from "@/lib/maps";

export type SlotState = "free" | "occupied" | "workshop" | "stale";
export interface MapSlot { id: string; code: string; lat: number; lng: number; state: SlotState; label: string }
export interface MapZone { id: string; code: string; ring: LatLng[] }

interface Props {
  center: LatLng;
  zoom: number;
  mapId: string;
  mapType: string;
  slots: MapSlot[];
  zones: MapZone[];
  selectedId: string | null;
  draggable: boolean;
  me: (LatLng & { accuracy: number }) | null;
  onSlotClick: (id: string) => void;
  onMapClick: (p: LatLng) => void;
  onSlotMoved: (id: string, p: LatLng) => void;
  onReady?: (map: google.maps.Map) => void;
}

type Libs = Awaited<ReturnType<typeof loadMaps>>;

/**
 * Mappa satellitare del piazzale (sezione 12): un Advanced Marker per stallo, colore per stato,
 * contorno delle zone, punto blu con l'accuratezza della posizione del telefono.
 */
export function YardMap(p: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const libs = useRef<Libs | null>(null);
  const markers = useRef(new Map<string, google.maps.marker.AdvancedMarkerElement>());
  const shapes = useRef<Array<google.maps.Polygon | google.maps.Circle | google.maps.marker.AdvancedMarkerElement>>([]);
  const handlers = useRef(p);
  handlers.current = p;
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Mappa: una volta sola
  useEffect(() => {
    let alive = true;
    (window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => setError("Google ha rifiutato la chiave Maps (dominio non autorizzato o API non attiva).");
    loadMaps().then((l) => {
      if (!alive || !box.current) return;
      libs.current = l;
      map.current = new l.Map(box.current, {
        center: p.center, zoom: p.zoom, mapId: p.mapId, mapTypeId: p.mapType, tilt: 0,
        disableDefaultUI: true, zoomControl: true, gestureHandling: "greedy", clickableIcons: false,
      });
      map.current.addListener("click", (e: google.maps.MapMouseEvent) => e.latLng && handlers.current.onMapClick(e.latLng.toJSON()));
      handlers.current.onReady?.(map.current);
      setReady(true);
    }).catch((e: Error) => setError(e.message));
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- centro e zoom iniziali soltanto

  // Stalli: si riusano i marker esistenti, si aggiornano posizione, aspetto e trascinabilità
  useEffect(() => {
    const l = libs.current, m = map.current;
    if (!ready || !l || !m) return;
    const seen = new Set<string>();
    for (const s of p.slots) {
      seen.add(s.id);
      const cls = `yard-pin yard-pin--${s.state}${s.id === p.selectedId ? " yard-pin--selected" : ""}`;
      let mk = markers.current.get(s.id);
      if (!mk) {
        const el = document.createElement("div");
        mk = new l.AdvancedMarkerElement({ map: m, position: s, content: el, gmpClickable: true });
        mk.addListener("click", () => handlers.current.onSlotClick(s.id));
        mk.addListener("dragend", () => {
          const pos = mk!.position as google.maps.LatLngLiteral | google.maps.LatLng | null;
          if (pos) handlers.current.onSlotMoved(s.id, "toJSON" in pos ? pos.toJSON() : pos);
        });
        markers.current.set(s.id, mk);
      }
      const el = mk.content as HTMLElement;
      el.className = cls;
      el.textContent = s.label;
      mk.title = s.label;
      mk.position = s;
      mk.gmpDraggable = p.draggable;
      mk.zIndex = s.id === p.selectedId ? 1000 : s.state === "free" ? 1 : 10;
    }
    for (const [id, mk] of markers.current) if (!seen.has(id)) { mk.map = null; markers.current.delete(id); }
  }, [ready, p.slots, p.selectedId, p.draggable]);

  // Zone e posizione del telefono
  useEffect(() => {
    const l = libs.current, m = map.current;
    if (!ready || !l || !m) return;
    shapes.current.forEach((s) => { if ("setMap" in s) s.setMap(null); else s.map = null; });
    shapes.current = p.zones.filter((z) => z.ring.length >= 3).map((z) => new l.Polygon({
      map: m, paths: z.ring, strokeColor: tokenColor("card"), strokeOpacity: 0.9, strokeWeight: 1.5, fillColor: tokenColor("primary"), fillOpacity: 0.08, clickable: false,
    }));
    if (p.me) {
      shapes.current.push(new l.Circle({ map: m, center: p.me, radius: p.me.accuracy, strokeWeight: 0, fillColor: tokenColor("info"), fillOpacity: 0.15, clickable: false }));
      const dot = document.createElement("div");
      dot.className = "yard-me";
      shapes.current.push(new l.AdvancedMarkerElement({ map: m, position: p.me, content: dot, zIndex: 2000 }));
    }
  }, [ready, p.zones, p.me]);

  if (error) return <div className="grid h-[60dvh] place-items-center rounded-2xl bg-muted p-6 text-center text-sm text-destructive-ink">{error}</div>;
  return (
    <div className="relative h-[60dvh] min-h-[320px] overflow-hidden rounded-2xl border border-border bg-muted">
      <div ref={box} className="h-full w-full" />
      {!ready && <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">Carico la mappa…</div>}
    </div>
  );
}
