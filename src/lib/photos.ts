import { useQuery } from "@tanstack/react-query";
import { callFunction, supabase } from "@/lib/supabase";

const BUCKET = "dealercrm-photos";
const MAX_SIDE = 1600;

/** Riduce la foto (lato lungo 1600 px, JPEG 0,8) prima dell'invio: dal telefono arrivano file da diversi MB. */
export async function resizePhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.8));
}

export interface PhotoMeta { vehicle_id: string; condition_id: string | null; kind: string; zone: string | null }

/** Carica la foto con un link firmato (vehicle-media) e registra la riga vehicle_photo. Restituisce il percorso. */
async function uploadNow(blob: Blob, meta: PhotoMeta): Promise<string> {
  const { path, token } = await callFunction<{ path: string; token: string }>("vehicle-media", { action: "upload", vehicle_id: meta.vehicle_id, file_name: `${meta.zone ?? meta.kind}.jpg` });
  const { error } = await supabase.storage.from(BUCKET).uploadToSignedUrl(path, token, blob, { contentType: "image/jpeg" });
  if (error) throw error;
  const { error: rowErr } = await supabase.from("vehicle_photo").insert({ ...meta, storage_path: path });
  if (rowErr) throw rowErr;
  return path;
}

// ---------- coda offline (IndexedDB): le foto scattate senza rete partono quando torna la connessione ----------
const DB = "dealercrm-photos", STORE = "queue";
interface Queued { id: string; blob: Blob; meta: PhotoMeta; at: number }

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = fn(d.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
const listeners = new Set<(n: number) => void>();
async function notify() { const n = await pendingCount(); listeners.forEach((l) => l(n)); }
export async function pendingCount() { try { return await tx("readonly", (s) => s.count()); } catch { return 0; } }
export function onQueueChange(fn: (n: number) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

/** Prova a caricare subito; senza rete (o se l'invio fallisce per la rete) la foto va in coda. */
export async function savePhoto(file: File, meta: PhotoMeta): Promise<{ path: string | null; queued: boolean }> {
  const blob = await resizePhoto(file);
  if (navigator.onLine) {
    try { return { path: await uploadNow(blob, meta), queued: false }; }
    catch (e) { if (navigator.onLine) throw e; }
  }
  try {
    await tx("readwrite", (s) => s.put({ id: crypto.randomUUID(), blob, meta, at: Date.now() } satisfies Queued));
  } catch {
    throw new Error("Senza rete e senza spazio locale: riprova quando torna la connessione");
  }
  void notify();
  return { path: null, queued: true };
}

let flushing = false;
/** Invia le foto in coda, una alla volta; quelle che falliscono restano per il prossimo tentativo. */
export async function flushQueue(): Promise<number> {
  if (flushing || !navigator.onLine) return 0;
  flushing = true;
  let sent = 0;
  try {
    const items = await tx<Queued[]>("readonly", (s) => s.getAll() as IDBRequest<Queued[]>);
    for (const it of items) {
      try { await uploadNow(it.blob, it.meta); await tx("readwrite", (s) => s.delete(it.id)); sent++; }
      catch { break; }
    }
  } catch { /* IndexedDB non disponibile */ } finally { flushing = false; void notify(); }
  return sent;
}
if (typeof window !== "undefined") window.addEventListener("online", () => { void flushQueue(); });

/** Link temporanei (un'ora) per mostrare le foto: le chiede alla funzione vehicle-media, che controlla chi le vede. */
export function usePhotoUrls(paths: string[]) {
  const key = [...paths].sort();
  return useQuery({
    queryKey: ["photo-urls", key],
    enabled: paths.length > 0,
    staleTime: 50 * 60_000,
    queryFn: async () => (await callFunction<{ urls: Record<string, string> }>("vehicle-media", { action: "urls", paths })).urls,
  });
}
