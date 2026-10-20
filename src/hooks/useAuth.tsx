import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, type Device, type Profile } from "@/lib/supabase";
import { deviceName, getInstallId } from "@/lib/device";

interface AuthState {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  device: Device | null;
  /** true solo con utente attivo e dispositivo approvato */
  ready: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  refreshDevice: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [device, setDevice] = useState<Device | null>(null);

  // Registra il dispositivo (in attesa di approvazione la prima volta) e aggiorna l'ultimo accesso.
  const loadDevice = useCallback(async () => {
    const { data } = await supabase.rpc("register_device", { _install_id: getInstallId(), _name: deviceName() });
    setDevice((data as Device) ?? null);
  }, []);

  const loadProfile = useCallback(async (userId: string) => {
    const { data } = await supabase.from("profile").select("*").eq("id", userId).maybeSingle();
    setProfile((data as Profile) ?? null);
    if (data?.is_active) await loadDevice();
  }, [loadDevice]);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session) await loadProfile(data.session.user.id);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      setSession(s);
      if (s) await loadProfile(s.user.id);
      else { setProfile(null); setDevice(null); }
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, [loadProfile]);

  // Finché il dispositivo è in attesa, ricontrolla ogni 10 secondi: l'approvazione dell'amministratore vale subito.
  useEffect(() => {
    if (!session || !device || device.status === "authorized") return;
    const t = setInterval(() => loadDevice(), 10_000);
    return () => clearInterval(t);
  }, [session, device, loadDevice]);

  const value = useMemo<AuthState>(() => ({
    loading, session, profile, device,
    ready: Boolean(session && profile?.is_active && device?.status === "authorized"),
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return error ? (error.message === "Invalid login credentials" ? "E-mail o password non corretti" : error.message) : null;
    },
    signOut: async () => { await supabase.auth.signOut(); },
    refreshDevice: async () => { if (session) await loadDevice(); },
  }), [loading, session, profile, device, loadDevice]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth fuori da AuthProvider");
  return v;
}
