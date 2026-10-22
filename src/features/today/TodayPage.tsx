import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle, CloudUpload } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { ROLE_LABEL } from "@/lib/supabase";
import { LeadRow, type LeadOpen } from "@/features/leads/LeadRow";
import { WORK, WORK_STATUS } from "@/features/vehicles/conditions";
import { flushQueue, onQueueChange, pendingCount } from "@/lib/photos";
import { Button } from "@/components/ui/button";
import { fmtDate } from "@/lib/utils";

const SALES = ["admin", "owner", "sales_manager", "salesperson"];
const STOCK = ["admin", "owner", "sales_manager", "used_manager", "reconditioning", "yard", "marketing"];

/** Oggi: per le vendite le lead per tempo residuo; per stock e officina le allerte sulle auto e le lavorazioni aperte. */
export function TodayPage() {
  const { profile } = useAuth();
  const role = profile?.role ?? "";
  const mine = role === "salesperson";
  const sales = SALES.includes(role);
  const stock = STOCK.includes(role);
  const [queued, setQueued] = useState(0);
  useEffect(() => { void pendingCount().then(setQueued); return onQueueChange(setQueued); }, []);

  const leads = useQuery({
    queryKey: ["lead_open", mine ? profile?.id : "all"],
    enabled: sales,
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
  const alerts = useQuery({
    queryKey: ["vehicle_alert"],
    enabled: stock,
    queryFn: async () => (await supabase.from("vehicle_alert").select("vehicle_id,plate,make,model,code,severity,message,days").order("plate")).data ?? [],
    refetchInterval: 5 * 60_000,
  });
  const works = useQuery({
    queryKey: ["works_open"],
    enabled: ["admin", "used_manager", "reconditioning"].includes(role),
    queryFn: async () => {
      const { data } = await supabase.from("vehicle_work_list").select("id,vehicle_id,kind,status,started_at,notes").neq("status", "done").order("created_at");
      const ids = [...new Set((data ?? []).map((w) => w.vehicle_id))];
      const { data: v } = ids.length ? await supabase.from("vehicle_public").select("id,plate,make,model").in("id", ids) : { data: [] };
      const vm = new Map((v ?? []).map((x) => [x.id, x]));
      return (data ?? []).map((w) => ({ ...w, vehicle: vm.get(w.vehicle_id) }));
    },
  });

  const open = leads.data ?? [];
  const late = open.filter((l) => l.status_deadline_at && new Date(l.status_deadline_at).getTime() < Date.now());
  const alertRows = alerts.data ?? [];

  return (
    <>
      <div>
        <h1 className="text-2xl">Oggi</h1>
        <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })} · {profile ? ROLE_LABEL[profile.role] : ""}</p>
      </div>

      {queued > 0 && (
        <div className="card flex flex-wrap items-center justify-between gap-2 border-info p-3 text-sm">
          <span><CloudUpload className="mr-1.5 inline h-4 w-4 text-info-ink" />{queued} foto in attesa di rete</span>
          <Button size="sm" variant="outline" onClick={() => void flushQueue()}>Invia ora</Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {sales && <Kpi label="Lead aperte" value={leads.isLoading ? "…" : String(open.length)} sub={`${late.length} oltre il timer`} />}
        {sales && <Kpi label="Scadute" value={String(late.length)} sub="da gestire subito" tone={late.length ? "bad" : undefined} />}
        <Kpi label="Auto in stock" value={vehicles.data == null ? "…" : String(vehicles.data)} sub="non vendute" />
        {stock && <Kpi label="Allerte auto" value={alerts.isLoading ? "…" : String(alertRows.length)} sub={`${alertRows.filter((a) => a.severity === "bad").length} urgenti`} tone={alertRows.some((a) => a.severity === "bad") ? "bad" : undefined} />}
        {works.data && <Kpi label="Lavorazioni aperte" value={String(works.data.length)} sub={`${works.data.filter((w) => w.status === "in_progress").length} in corso`} />}
      </div>

      {leads.error && <p className="card p-4 text-sm text-destructive-ink">Non riesco a leggere le lead: {(leads.error as Error).message}</p>}

      {sales && (
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 pb-2 pt-4"><h2 className="text-lg">Lead per tempo residuo</h2><Link to="/lead" className="text-sm font-bold text-primary">Tutte</Link></div>
          <div>
            {open.slice(0, 8).map((l) => <LeadRow key={l.id} lead={l} />)}
            {!leads.isLoading && open.length === 0 && <p className="px-4 pb-4 text-sm text-muted-foreground">Nessuna lead aperta.</p>}
          </div>
        </section>
      )}

      {stock && (
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 pb-2 pt-4"><h2 className="text-lg">Allerte sulle auto</h2><Link to="/auto" className="text-sm font-bold text-primary">Auto</Link></div>
          {alertRows.map((a) => (
            <Link key={`${a.vehicle_id}-${a.code}`} to={`/auto/${a.vehicle_id}`} className="flex items-center gap-3 border-t border-border px-4 py-2.5 text-sm hover:bg-muted">
              <AlertTriangle className={a.severity === "bad" ? "h-4 w-4 shrink-0 text-destructive-ink" : "h-4 w-4 shrink-0 text-warning-ink"} />
              <span className="min-w-0 flex-1 truncate"><b>{a.plate}</b> · {a.make} {a.model} · {a.message}</span>
              {a.days != null && <span className="text-xs text-muted-foreground">{a.days} gg</span>}
            </Link>
          ))}
          {!alerts.isLoading && alertRows.length === 0 && <p className="px-4 pb-4 text-sm text-muted-foreground">Nessuna allerta.</p>}
        </section>
      )}

      {works.data && (
        <section className="card overflow-hidden">
          <div className="px-4 pb-2 pt-4"><h2 className="text-lg">Lavorazioni aperte</h2></div>
          {works.data.map((w) => (
            <Link key={w.id} to={`/auto/${w.vehicle_id}`} className="flex items-center gap-3 border-t border-border px-4 py-2.5 text-sm hover:bg-muted">
              <span className="min-w-0 flex-1 truncate"><b>{w.vehicle?.plate ?? "Auto"}</b> · {WORK[w.kind] ?? w.kind}{w.notes ? ` · ${w.notes}` : ""}</span>
              <span className="text-xs text-muted-foreground">{WORK_STATUS[w.status]}{w.started_at ? ` dal ${fmtDate(w.started_at)}` : ""}</span>
            </Link>
          ))}
          {works.data.length === 0 && <p className="px-4 pb-4 text-sm text-muted-foreground">Nessuna lavorazione aperta.</p>}
        </section>
      )}
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
