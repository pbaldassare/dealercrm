import { createClient } from "@supabase/supabase-js";

/** Chiave publishable (già in `.github/workflows/pages.yml`): pubblica, protetta da login e RLS. */
const DEFAULT_URL = "https://moyfkdwsghidkcifesrg.supabase.co";
const DEFAULT_ANON = "sb_publishable_q23OIkc-TZN0xlf5aX0mBg_9-RJK71d";

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || DEFAULT_URL;
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || DEFAULT_ANON;

export const supabaseConfigured = Boolean(url && key);

/** Client unico sullo schema dealercrm. Il vincolo x-device-id è spento. */
export const supabase = createClient(url, key, {
  db: { schema: "dealercrm" },
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/** Chiama una Edge Function e restituisce il messaggio d'errore del server invece di quello generico. */
export async function callFunction<T = Record<string, unknown>>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(detail?.error ?? (detail?.missing ? `Dati mancanti: ${detail.missing.join(", ")}` : error.message));
  }
  return data as T;
}

export type AppRole =
  | "admin" | "owner" | "sales_manager" | "salesperson" | "used_manager"
  | "reconditioning" | "yard" | "accounting" | "finance_insurance" | "marketing";

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Amministratore",
  owner: "Direzione",
  sales_manager: "Responsabile vendite",
  salesperson: "Venditore",
  used_manager: "Responsabile usato",
  reconditioning: "Ricondizionamento",
  yard: "Piazzale",
  accounting: "Amministrazione",
  finance_insurance: "F&I",
  marketing: "Marketing",
};

export interface Profile {
  id: string;
  dealership_id: string;
  full_name: string;
  role: AppRole;
  phone: string | null;
  is_active: boolean;
  is_available: boolean;
  enabled_bands: string[] | null;
}

