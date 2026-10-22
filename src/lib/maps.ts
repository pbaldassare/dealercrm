import { Loader } from "@googlemaps/js-api-loader";

/** Chiave browser della Maps JavaScript API (limitata per referrer). Senza chiave il piazzale usa la griglia. */
export const MAPS_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) || "";
/** Map ID per gli Advanced Markers; DEMO_MAP_ID è quello di prova di Google. */
export const ENV_MAP_ID = (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined) || "";

let loader: Loader | null = null;

/** Carica una sola volta le librerie maps e marker. */
export async function loadMaps() {
  loader ??= new Loader({ apiKey: MAPS_KEY, version: "weekly", language: "it", region: "IT" });
  const [maps, marker] = await Promise.all([loader.importLibrary("maps"), loader.importLibrary("marker")]);
  return { Map: maps.Map, Polygon: maps.Polygon, Circle: maps.Circle, AdvancedMarkerElement: marker.AdvancedMarkerElement };
}

export interface LatLng { lat: number; lng: number }

/** Distanza in metri (formula dell'emisenoverso), come yard_slot_nearest nel database. */
export function distanceM(a: LatLng, b: LatLng) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/** Colore di un token di src/index.css, per gli oggetti disegnati da Google (poligoni, cerchi). */
export function tokenColor(name: string, alpha = 1) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
  return alpha === 1 ? `hsl(${v})` : `hsl(${v} / ${alpha})`;
}

/** Posizione del telefono con alta precisione (navigator.geolocation: gratis, niente API di Google). */
export function currentPosition(): Promise<LatLng & { accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("Questo dispositivo non fornisce la posizione"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => reject(new Error(e.code === e.PERMISSION_DENIED ? "Permesso di posizione negato" : "Posizione non disponibile")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}
