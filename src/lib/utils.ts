import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const fmtEur = (n: number | null | undefined) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(n ?? 0));

/** Numero scritto all'italiana (15.200 o 15.200,50) o come arriva dal database (15200.00); vuoto = null. */
export function parseNum(s: string | null | undefined): number | null {
  const t = (s ?? "").trim().replace(/[€\s]/g, "");
  if (!t) return null;
  if (t.includes(",")) return Number(t.replace(/\./g, "").replace(",", "."));
  return Number(/^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, "") : t);
}

export const fmtDateTime = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }) : "—";

export const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" }) : "—";

/** Tempo residuo di un timer in forma breve: "12 min", "3 h", "2 g". Negativo se scaduto. */
export function timeLeft(deadline: string | null | undefined): { text: string; late: boolean; pct: number } | null {
  if (!deadline) return null;
  const left = new Date(deadline).getTime() - Date.now();
  const abs = Math.abs(left);
  const text = abs < 3_600_000 ? `${Math.round(abs / 60_000)} min` : abs < 86_400_000 ? `${Math.round(abs / 3_600_000)} h` : `${Math.round(abs / 86_400_000)} g`;
  return { text, late: left < 0, pct: left };
}
