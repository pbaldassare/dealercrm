import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ROLE_LABEL, callFunction, supabase, type AppRole, type Profile } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Pill } from "@/components/ui/pill";
import { Toggle } from "@/components/ui/toggle";

const sel = "h-11 w-full rounded-xl border border-input bg-card px-3 text-sm";
const BANDS = ["A", "B", "C", "D"];

/** Utenti del concessionario (solo admin): ruolo, disponibilità, fasce; creazione e reset password via Edge Function manage-user. */
export function UsersPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ full_name: "", email: "", role: "salesperson" as AppRole, phone: "" });
  const [tempPwd, setTempPwd] = useState<{ email: string; password: string } | null>(null);

  const users = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => { const { data, error } = await supabase.from("profile").select("*").order("role").order("full_name"); if (error) throw error; return (data ?? []) as Profile[]; },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["profiles"] });
  const err = (e: Error) => toast.error(e.message);

  const patch = useMutation({
    mutationFn: async ({ id, p }: { id: string; p: Partial<Profile> }) => { const { error } = await supabase.from("profile").update(p).eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Salvato"); refresh(); }, onError: err,
  });
  const fn = useMutation({
    mutationFn: (body: Record<string, unknown>) => callFunction<{ temporary_password?: string | null }>("manage-user", body),
    onSuccess: (data, body) => {
      refresh();
      if (data?.temporary_password) setTempPwd({ email: String(body.email ?? users.data?.find((u) => u.id === body.user_id)?.full_name ?? ""), password: data.temporary_password });
      toast.success(body.action === "create" ? "Utente creato" : body.action === "reset_password" ? "Password reimpostata" : "Salvato");
      if (body.action === "create") setForm({ full_name: "", email: "", role: "salesperson", phone: "" });
    },
    onError: err,
  });

  function submit(e: FormEvent) { e.preventDefault(); fn.mutate({ action: "create", ...form }); }

  return (
    <>
      <div><h1 className="text-2xl">Utenti</h1><p className="text-sm text-muted-foreground">{users.data?.length ?? "…"} persone · un ruolo a testa</p></div>
      {users.error && <p className="card p-4 text-sm text-destructive-ink">{(users.error as Error).message}</p>}

      {tempPwd && (
        <div className="card border-primary p-4">
          <h3 className="text-base">Password temporanea per {tempPwd.email}</h3>
          <p className="mt-1 text-sm text-muted-foreground">Comunicala alla persona: non verrà mostrata di nuovo.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2"><code className="select-all rounded-lg bg-secondary px-3 py-2 text-base font-bold tracking-wide">{tempPwd.password}</code>
            <Button size="sm" variant="outline" onClick={() => navigator.clipboard?.writeText(tempPwd.password).then(() => toast.success("Copiata")).catch(() => toast.error("Copia a mano"))}>Copia</Button>
            <Button size="sm" variant="ghost" onClick={() => setTempPwd(null)}>Chiudi</Button></div>
        </div>
      )}

      <section className="card overflow-hidden">
        {(users.data ?? []).map((u) => (
          <div key={u.id} className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3 first:border-t-0">
            <div className="min-w-0 flex-1">
              <div className="truncate font-bold">{u.full_name} {!u.is_active && <Pill tone="bad">disattivato</Pill>}</div>
              <div className="text-xs text-muted-foreground">{u.phone ?? "—"}</div>
            </div>
            <select aria-label="Ruolo" value={u.role} onChange={(e) => patch.mutate({ id: u.id, p: { role: e.target.value as AppRole } })} className="h-9 rounded-lg border border-input bg-card px-2 text-sm">
              {Object.entries(ROLE_LABEL).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
            </select>
            {u.role === "salesperson" && (
              <div className="flex items-center gap-1">
                {BANDS.map((b) => { const on = (u.enabled_bands ?? []).includes(b); return <button key={b} onClick={() => patch.mutate({ id: u.id, p: { enabled_bands: on ? (u.enabled_bands ?? []).filter((x) => x !== b) : [...(u.enabled_bands ?? []), b].sort() } })} className={`h-8 w-8 rounded-full text-xs font-bold ${on ? "bg-primary text-primary-foreground" : "border border-input text-muted-foreground"}`} aria-label={`Fascia ${b}`}>{b}</button>; })}
              </div>
            )}
            <div className="flex items-center gap-2 text-xs"><span className="text-muted-foreground">Disponibile</span><Toggle label="Disponibile" checked={u.is_available} onChange={(v) => patch.mutate({ id: u.id, p: { is_available: v } })} /></div>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => fn.mutate({ action: "reset_password", user_id: u.id })} disabled={fn.isPending}>Nuova password</Button>
              <Button size="sm" variant={u.is_active ? "ghost" : "primary"} onClick={() => fn.mutate({ action: u.is_active ? "deactivate" : "activate", user_id: u.id })} disabled={fn.isPending}>{u.is_active ? "Disattiva" : "Riattiva"}</Button>
            </div>
          </div>
        ))}
      </section>

      <form onSubmit={submit} className="card space-y-3 p-4">
        <h3 className="text-base">Nuovo utente</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <div><Label htmlFor="nn">Nome e cognome</Label><Input id="nn" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
          <div><Label htmlFor="ne">E-mail</Label><Input id="ne" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><Label htmlFor="nr">Ruolo</Label><select id="nr" className={sel} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as AppRole })}>{Object.entries(ROLE_LABEL).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></div>
          <div><Label htmlFor="np">Telefono</Label><Input id="np" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        </div>
        <p className="text-xs text-muted-foreground">Riceve una password temporanea da comunicare a voce; al primo accesso il suo dispositivo va approvato da Dispositivi.</p>
        <Button type="submit" disabled={fn.isPending}>Crea utente</Button>
      </form>
    </>
  );
}
