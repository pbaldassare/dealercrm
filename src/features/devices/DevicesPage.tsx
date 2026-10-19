import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase, type Device } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { fmtDateTime } from "@/lib/utils";

/** Approvazione e revoca dei dispositivi (solo admin). Massimo 2 autorizzati per utente: lo impone un trigger. */
export function DevicesPage() {
  const qc = useQueryClient();
  const { session } = useAuth();
  const devices = useQuery({
    queryKey: ["devices"],
    queryFn: async () => {
      const [d, p] = await Promise.all([
        supabase.from("device").select("*").order("requested_at", { ascending: false }),
        supabase.from("profile").select("id,full_name,role"),
      ]);
      if (d.error) throw d.error;
      const names = new Map((p.data ?? []).map((x) => [x.id, x.full_name as string]));
      return (d.data as Device[]).map((x) => ({ ...x, owner: names.get(x.user_id) ?? x.user_id.slice(0, 8) }));
    },
    refetchInterval: 15_000,
  });
  const set = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "authorized" | "revoked" }) => {
      const patch = status === "authorized"
        ? { status, authorized_at: new Date().toISOString(), authorized_by: session?.user.id, revoked_at: null }
        : { status, revoked_at: new Date().toISOString() };
      const { error } = await supabase.from("device").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => { toast.success(v.status === "authorized" ? "Dispositivo approvato" : "Dispositivo revocato"); qc.invalidateQueries({ queryKey: ["devices"] }); },
    onError: (e: Error) => toast.error(e.message.includes("max") ? "Questo utente ha già 2 dispositivi autorizzati" : e.message),
  });

  const groups: Array<[Device["status"], string]> = [["pending", "In attesa di approvazione"], ["authorized", "Autorizzati"], ["revoked", "Revocati"]];

  return (
    <>
      <div><h1 className="text-2xl">Dispositivi</h1><p className="text-sm text-muted-foreground">Ogni persona può usare al massimo 2 dispositivi approvati</p></div>
      {devices.error && <p className="card p-4 text-sm text-destructive-ink">{(devices.error as Error).message}</p>}
      {groups.map(([status, title]) => {
        const rows = (devices.data ?? []).filter((d) => d.status === status);
        return (
          <section key={status} className="card overflow-hidden">
            <div className="flex items-center justify-between px-4 pb-2 pt-4"><h3 className="text-base">{title}</h3><Pill tone={status === "pending" ? "warn" : status === "authorized" ? "ok" : "muted"}>{rows.length}</Pill></div>
            {rows.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">{d.owner} · {d.name ?? "Dispositivo"}</div>
                  <div className="text-xs text-muted-foreground">richiesto {fmtDateTime(d.requested_at)} · ultimo accesso {fmtDateTime(d.last_seen_at)}</div>
                </div>
                <div className="flex gap-2">
                  {status !== "authorized" && <Button size="sm" onClick={() => set.mutate({ id: d.id, status: "authorized" })} disabled={set.isPending}>Approva</Button>}
                  {status !== "revoked" && <Button size="sm" variant="outline" onClick={() => set.mutate({ id: d.id, status: "revoked" })} disabled={set.isPending}>Revoca</Button>}
                </div>
              </div>
            ))}
            {rows.length === 0 && <p className="px-4 pb-4 text-sm text-muted-foreground">Nessuno.</p>}
          </section>
        );
      })}
    </>
  );
}
