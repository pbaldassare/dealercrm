import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { ROLE_LABEL } from "@/lib/supabase";
import { LeadRow, type LeadOpen } from "@/features/leads/LeadRow";

export function TodayPage() {
  const { profile } = useAuth();
  const mine = profile?.role === "salesperson";

  const leads = useQuery({
    queryKey: ["lead_open", mine ? profile?.id : "all"],
    queryFn: async () => {
      let q = supabase.from("lead_open").select("*").not("source_ref", "is", null).order("status_deadline_at", { ascending: true, nullsFirst: false }).limit(50);
      if (mine && profile) q = q.eq("assigned_to", profile.id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as LeadOpen[];
    },
    refetchInterval: 60_000,
  });
  const vehicles = useQuery({
    queryKey: ["vehicle_count"],
    queryFn: async () => {
      const { count, error } = await supabase.from("vehicle_public").select("id", { count: "exact", head: true }).not("status", "in", "(sold,delivered,withdrawn)");
      if (error) throw error;
      return count ?? 0;
    },
  });

  const open = leads.data ?? [];
  const late = open.filter((l) => l.status_deadline_at && new Date(l.status_deadline_at).getTime() < Date.now());

  return (
    <>
      <div>
        <h1 className="text-2xl">Oggi</h1>
        <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })} · {profile ? ROLE_LABEL[profile.role] : ""}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Lead aperte" value={leads.isLoading ? "…" : String(open.length)} sub={`${late.length} oltre il timer`} />
        <Kpi label="Scadute" value={String(late.length)} sub="da gestire subito" tone={late.length ? "bad" : undefined} />
        <Kpi label="Auto in stock" value={vehicles.data == null ? "…" : String(vehicles.data)} sub="pubblicate e pronte" />
        <Kpi label="Appuntamenti" value="—" sub="fase 3" />
      </div>

      {leads.error && <p className="card p-4 text-sm text-destructive-ink">Non riesco a leggere le lead: {(leads.error as Error).message}</p>}

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <h2 className="text-lg">Lead per tempo residuo</h2>
          <Link to="/lead" className="text-sm font-bold text-primary">Tutte</Link>
        </div>
        <div>
          {open.slice(0, 8).map((l) => <LeadRow key={l.id} lead={l} />)}
          {!leads.isLoading && open.length === 0 && <p className="px-4 pb-4 text-sm text-muted-foreground">Nessuna lead aperta.</p>}
        </div>
      </section>
    </>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "bad" }) {
  return (
    <div className="card p-3.5">
      <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-0.5 font-display text-2xl font-extrabold tabular-nums ${tone === "bad" ? "text-destructive-ink" : ""}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
