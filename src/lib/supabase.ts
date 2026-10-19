import { createClient } from "@supabase/supabase-js";
import { getInstallId } from "./device";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && key);

/** Client unico: schema etidealcrm e header x-device-id su ogni chiamata (REST, RPC e storage). */
export const supabase = createClient(url ?? "https://example.invalid", key ?? "anon", {
  db: { schema: "etidealcrm" },
  global: { headers: { "x-device-id": getInstallId() } },
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

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

export interface Device {
  id: string;
  user_id: string;
  install_id: string;
  name: string | null;
  status: "pending" | "authorized" | "revoked";
  requested_at: string | null;
  authorized_at: string | null;
  revoked_at: string | null;
  last_seen_at: string | null;
}
