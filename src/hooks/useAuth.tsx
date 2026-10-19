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

  const loadDevice = useCallback(async (userId: string) => {
    const installId = getInstallId();
    const { data } = await supabase.from("device").select("*").eq("user_id", userId).eq("install_id", installId).maybeSingle();
    if (data) {
      setDevice(data as Device);
      void supabase.from("device").update({ last_seen_at: new Date().toISOString() }).eq("id", data.id);
      return;
    }
    // Prima volta su questo dispositivo: lo registriamo in attesa di approvazione.
    const { data: created } = await supabase
      .from("device")
      .insert({ user_id: userId, install_id: installId, name: deviceName(), status: "pending", requested_at: new Date().toISOString() })
      .select("*")
      .single();
    setDevice((created as Device) ?? null);
  }, []);

  const loadProfile = useCallback(async (userId: string) => {
    const { data } = await supabase.from("profile").select("*").eq("id", userId).maybeSingle();
    setProfile((data as Profile) ?? null);
    if (data) await loadDevice(userId);
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
    const t = setInterval(() => loadDevice(session.user.id), 10_000);
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
    refreshDevice: async () => { if (session) await loadDevice(session.user.id); },
  }), [loading, session, profile, device, loadDevice]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth fuori da AuthProvider");
  return v;
}
