import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { CHANNEL } from "./LeadRow";

const sel = "h-11 w-full rounded-xl border border-input bg-card px-3 text-sm";
const MANUAL_CHANNELS = ["walk_in", "phone", "whatsapp", "website", "facebook", "instagram", "other_portal", "autoscout24"];
const normPhone = (s: string) => { const p = s.replace(/[^\d+]/g, ""); return !p ? null : p.startsWith("+") ? p : p.startsWith("00") ? "+" + p.slice(2) : "+39" + p; };

/**
 * Lead inserita a mano (cliente in salone, telefonata). Il venditore la prende lui ed è già "contattata";
 * il responsabile la assegna a un venditore o lascia fare all'assegnazione automatica.
 */
export function NewLeadPage() {
  const nav = useNavigate();
  const { profile } = useAuth();
  const mine = profile?.role === "salesperson";
  const [f, setF] = useState({ first_name: "", last_name: "", phone: "", email: "", channel: "walk_in", vehicle_id: "", interest: "", assign: "" });
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  const refs = useQuery({
    queryKey: ["new-lead-refs"],
    queryFn: async () => {
      const [v, s] = await Promise.all([
        supabase.from("vehicle_public").select("id,plate,make,model,status").in("status", ["ready", "published", "reserved", "reconditioning", "received"]).order("plate"),
        mine ? { data: [] } : supabase.from("profile").select("id,full_name").eq("role", "salesperson").eq("is_active", true).order("full_name"),
      ]);
      return { vehicles: v.data ?? [], sellers: s.data ?? [] };
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("Profilo mancante");
      if (!f.last_name.trim()) throw new Error("Inserisci il cognome");
      const phone = normPhone(f.phone);
      const email = f.email.trim().toLowerCase() || null;
      // cliente: si riusa se telefono o e-mail sono già noti
      let customerId: string | null = null;
      if (phone) customerId = (await supabase.from("customer").select("id").eq("phone", phone).maybeSingle()).data?.id ?? null;
      if (!customerId && email) customerId = (await supabase.from("customer").select("id").ilike("email", email).maybeSingle()).data?.id ?? null;
      if (!customerId) {
        const { data, error } = await supabase.from("customer").insert({ dealership_id: profile.dealership_id, first_name: f.first_name.trim(), last_name: f.last_name.trim(), phone, email }).select("id").single();
        if (error) throw error;
        customerId = data.id;
      }
      const now = new Date().toISOString();
      const base = { dealership_id: profile.dealership_id, customer_id: customerId, channel: f.channel, vehicle_id: f.vehicle_id || null, interest_text: f.interest || null, source_ref: `M-${now.slice(2, 10).replace(/-/g, "")}-${now.slice(11, 16).replace(":", "")}` };
      if (mine) {
        const { data, error } = await supabase.from("lead").insert({ ...base, status: "contacted", assigned_to: profile.id, assigned_at: now, first_contact_at: now, last_contact_at: now, response_minutes: 0 }).select("id").single();
        if (error) throw error;
        return data.id as string;
      }
      const { data, error } = await supabase.from("lead").insert({ ...base, status: "qualified" }).select("id").single();
      if (error) throw error;
      const { error: aErr } = await supabase.rpc("assign_lead", { _lead_id: data.id, _to: f.assign || null, _reason: f.assign ? "manual_new" : "manual_new_auto" });
      if (aErr) throw aErr;
      return data.id as string;
    },
    onSuccess: (id) => { toast.success("Lead creata"); nav(`/lead/${id}`); },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit(e: FormEvent) { e.preventDefault(); create.mutate(); }

  return (
    <>
      <Link to="/lead" className="text-sm font-bold text-primary">‹ Lead</Link>
      <h1 className="text-2xl">Nuova lead</h1>
      <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        <section className="card space-y-3 p-4">
          <h3 className="text-base">Cliente</h3>
          <div className="grid grid-cols-2 gap-2">
            <div><Label htmlFor="fn">Nome</Label><Input id="fn" value={f.first_name} onChange={(e) => set("first_name", e.target.value)} /></div>
            <div><Label htmlFor="ln">Cognome</Label><Input id="ln" required value={f.last_name} onChange={(e) => set("last_name", e.target.value)} /></div>
            <div><Label htmlFor="ph">Telefono</Label><Input id="ph" type="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></div>
            <div><Label htmlFor="em">E-mail</Label><Input id="em" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></div>
          </div>
          <p className="text-xs text-muted-foreground">Se telefono o e-mail sono già in anagrafica, la lead si collega a quel cliente.</p>
        </section>
        <section className="card space-y-3 p-4">
          <h3 className="text-base">Richiesta</h3>
          <div><Label htmlFor="ch">Canale</Label>
            <select id="ch" className={sel} value={f.channel} onChange={(e) => set("channel", e.target.value)}>{MANUAL_CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL[c]}</option>)}</select></div>
          <div><Label htmlFor="veh">Auto di interesse</Label>
            <select id="veh" className={sel} value={f.vehicle_id} onChange={(e) => set("vehicle_id", e.target.value)}>
              <option value="">nessuna in particolare</option>{refs.data?.vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate} · {v.make} {v.model}</option>)}
            </select></div>
          <div><Label htmlFor="in">Note</Label><Input id="in" value={f.interest} onChange={(e) => set("interest", e.target.value)} placeholder="cosa cerca, budget, permuta…" /></div>
          {!mine && (
            <div><Label htmlFor="as">Assegna a</Label>
              <select id="as" className={sel} value={f.assign} onChange={(e) => set("assign", e.target.value)}>
                <option value="">assegnazione automatica (punteggio 40/40/20)</option>{refs.data?.sellers.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select></div>
          )}
          {mine && <p className="text-xs text-muted-foreground">La lead è assegnata a te e risulta già contattata.</p>}
          <Button type="submit" className="w-full" disabled={create.isPending}>{create.isPending ? "Creo…" : "Crea lead"}</Button>
        </section>
      </form>
    </>
  );
}
