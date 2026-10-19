import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { CHANNEL, LEAD_STATUS, statusTone, type LeadOpen } from "./LeadRow";
import { fmtDateTime, timeLeft } from "@/lib/utils";

// Transizioni consentite: le stesse di change_lead_status() nel database
const NEXT: Record<string, string[]> = {
  new: ["ai_qualifying", "invalid"], ai_qualifying: ["qualified", "invalid"], qualified: ["assigned"], assigned: ["contacted"],
  contacted: ["appointment_set", "lost"], appointment_set: ["visited", "contacted", "lost"], visited: ["proposal_sent", "lost"],
  proposal_sent: ["negotiating", "lost"], negotiating: ["won", "lost"],
};
const LOST: Record<string, string> = {
  price_too_high: "Prezzo troppo alto", vehicle_sold: "Auto venduta", chose_competitor: "Scelto concorrente", no_response: "Nessuna risposta",
  financing_denied: "Finanziamento negato", trade_in_not_accepted: "Permuta non accettata", changed_mind: "Ha cambiato idea", other: "Altro",
};

export function LeadDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const lead = useQuery({
    queryKey: ["lead", id],
    queryFn: async () => {
      // Letture separate invece di embed PostgREST: vehicle_public è una vista e il venditore non deve vedere la tabella vehicle.
      const { data, error } = await supabase.from("lead").select("*").eq("id", id!).single();
      if (error) throw error;
      const [customer, vehicle, assignee] = await Promise.all([
        data.customer_id ? supabase.from("customer").select("first_name,last_name,phone").eq("id", data.customer_id).maybeSingle() : null,
        data.vehicle_id ? supabase.from("vehicle_public").select("plate,make,model").eq("id", data.vehicle_id).maybeSingle() : null,
        data.assigned_to ? supabase.from("profile").select("full_name").eq("id", data.assigned_to).maybeSingle() : null,
      ]);
      return { ...data, customer: customer?.data ?? null, vehicle: vehicle?.data ?? null, assignee: assignee?.data ?? null } as LeadOpen & {
        customer: { first_name: string; last_name: string; phone: string | null } | null;
        vehicle: { plate: string; make: string; model: string } | null;
        assignee: { full_name: string } | null; ai_summary: string | null; lost_reason: string | null;
      };
    },
  });
  const conv = useQuery({
    queryKey: ["conversation", id],
    queryFn: async () => { const { data } = await supabase.from("conversation").select("*").eq("lead_id", id!).order("at"); return data ?? []; },
  });
  const change = useMutation({
    mutationFn: async ({ to, lost }: { to: string; lost?: string }) => {
      const { error } = await supabase.rpc("change_lead_status", { _lead_id: id, _to_status: to, _payload: lost ? { lost_reason: lost } : {} });
      if (error) throw error;
    },
    onSuccess: (_d, v) => { toast.success(`Lead → ${LEAD_STATUS[v.to]}`); qc.invalidateQueries({ queryKey: ["lead"] }); qc.invalidateQueries({ queryKey: ["lead_open"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (lead.isLoading) return <p className="text-sm text-muted-foreground">Carico…</p>;
  if (lead.error || !lead.data) return <p className="card p-4 text-sm text-destructive-ink">Lead non trovata o non visibile con il tuo ruolo.</p>;
  const l = lead.data;
  const t = timeLeft(l.status_deadline_at);
  const next = NEXT[l.status] ?? [];

  return (
    <>
      <Link to="/lead" className="text-sm font-bold text-primary">‹ Lead</Link>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl">{l.customer ? `${l.customer.first_name} ${l.customer.last_name}` : "Cliente"}</h1>
          <p className="text-sm text-muted-foreground">{l.source_ref} · {CHANNEL[l.channel] ?? l.channel} · fascia {l.price_band ?? "—"}</p>
        </div>
        <Pill tone={statusTone(l.status)}>{LEAD_STATUS[l.status] ?? l.status}</Pill>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card p-4">
          <div className="flex items-center justify-between"><h3 className="text-base">Stato e timer</h3>
            {t && <span className={`font-display font-extrabold tabular-nums ${t.late ? "text-destructive-ink" : "text-success-ink"}`}>{t.late ? "−" : ""}{t.text}</span>}</div>
          <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Venditore</dt><dd className="text-right font-semibold">{l.assignee?.full_name ?? "non assegnata"}</dd>
            <dt className="text-muted-foreground">Punteggio IA</dt><dd className="text-right font-semibold">{l.ai_score ?? "—"}/100</dd>
            <dt className="text-muted-foreground">Auto</dt><dd className="text-right font-semibold">{l.vehicle ? `${l.vehicle.make} ${l.vehicle.model} · ${l.vehicle.plate}` : "—"}</dd>
            <dt className="text-muted-foreground">Telefono</dt><dd className="text-right font-semibold">{l.customer?.phone ?? "—"}</dd>
            <dt className="text-muted-foreground">Nello stato dal</dt><dd className="text-right font-semibold">{fmtDateTime(l.status_changed_at)}</dd>
            {l.lost_reason && <><dt className="text-muted-foreground">Motivo perdita</dt><dd className="text-right font-semibold">{LOST[l.lost_reason] ?? l.lost_reason}</dd></>}
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            {l.customer?.phone && <a href={`tel:${l.customer.phone}`}><Button>Chiama</Button></a>}
            {l.customer?.phone && <a href={`https://wa.me/${l.customer.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"><Button variant="outline">WhatsApp</Button></a>}
            {!["lost", "invalid"].includes(l.status) && <Link to={`/pratiche/nuova?lead=${l.id}`}><Button variant="outline">Crea pratica</Button></Link>}
          </div>
        </section>

        <section className="card p-4">
          <h3 className="text-base">Cambia stato</h3>
          <p className="mb-3 mt-1 text-sm text-muted-foreground">Solo le transizioni consentite da change_lead_status.</p>
          <div className="flex flex-wrap gap-2">
            {next.filter((s) => s !== "lost").map((s) => (
              <Button key={s} size="sm" variant={s === "invalid" ? "outline" : "primary"} disabled={change.isPending} onClick={() => change.mutate({ to: s })}>{LEAD_STATUS[s]}</Button>
            ))}
            {next.length === 0 && <Pill>Stato finale</Pill>}
          </div>
          {next.includes("lost") && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-bold text-destructive-ink">Segna come persa…</summary>
              <div className="mt-2 flex flex-wrap gap-2">
                {Object.entries(LOST).map(([k, n]) => <Button key={k} size="sm" variant="outline" disabled={change.isPending} onClick={() => change.mutate({ to: "lost", lost: k })}>{n}</Button>)}
              </div>
            </details>
          )}
        </section>
      </div>

      <section className="card p-4">
        <h3 className="text-base">Conversazione</h3>
        <div className="mt-3 flex flex-col gap-2">
          {(conv.data ?? []).map((c: { id: string; direction: string; body: string | null; at: string; is_ai: boolean }) => (
            <div key={c.id} className={`max-w-[88%] rounded-2xl px-3.5 py-2 text-sm ${c.direction === "in" ? "self-start bg-secondary" : "self-end bg-primary/10"}`}>
              <div>{c.body}</div><div className="mt-0.5 text-[11px] text-muted-foreground">{c.is_ai ? "Assistente IA · " : ""}{fmtDateTime(c.at)}</div>
            </div>
          ))}
          {conv.data?.length === 0 && <p className="text-sm text-muted-foreground">Nessun messaggio registrato.</p>}
        </div>
        {l.ai_summary && <div className="mt-3 rounded-xl bg-primary/10 p-3 text-sm"><b className="text-primary">Assistente IA ·</b> {l.ai_summary}</div>}
      </section>
    </>
  );
}
