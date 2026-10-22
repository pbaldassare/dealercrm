import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { DataTable, type Column } from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { fmtDate, timeLeft } from "@/lib/utils";
import { CHANNEL, LEAD_STATUS, LeadRow, statusTone, type LeadOpen } from "./LeadRow";

const FINAL = ["won", "lost", "invalid"];
const TEMP: Record<string, string> = { hot: "Calda", warm: "Tiepida", cold: "Fredda", invalid: "Non valida" };

export interface LeadListRow extends LeadOpen {
  created_at: string;
  customer: { first_name: string; last_name: string; phone: string | null } | null;
  assignee: { full_name: string } | null;
  plate: string | null;
}

/** Elenco lead del backoffice: tabella con filtri, riassegnazione di più lead insieme (responsabile e admin), export. */
export function LeadsPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const mine = profile?.role === "salesperson";
  const canAssign = profile?.role === "admin" || profile?.role === "sales_manager";
  const canCreate = canAssign || mine;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignTo, setAssignTo] = useState("");

  const q = useQuery({
    queryKey: ["leads", profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("lead")
        .select("id,source_ref,channel,status,status_changed_at,status_deadline_at,temperature,ai_score,price_band,assigned_to,interest_text,vehicle_id,created_at,customer:customer_id(first_name,last_name,phone),assignee:assigned_to(full_name)")
        .order("created_at", { ascending: false }).limit(2000);
      if (error) throw error;
      const rows = (data ?? []) as unknown as Array<Omit<LeadListRow, "plate" | "remaining_seconds">>;
      const ids = [...new Set(rows.map((r) => r.vehicle_id).filter(Boolean))] as string[];
      const { data: v } = ids.length ? await supabase.from("vehicle_public").select("id,plate").in("id", ids) : { data: [] };
      const plates = new Map((v ?? []).map((x) => [x.id, x.plate as string]));
      return rows.map((r) => ({ ...r, remaining_seconds: null, plate: r.vehicle_id ? plates.get(r.vehicle_id) ?? null : null })) as LeadListRow[];
    },
  });
  const sellers = useQuery({
    queryKey: ["sellers"],
    enabled: canAssign,
    queryFn: async () => (await supabase.from("profile").select("id,full_name,role,is_available").in("role", ["salesperson", "sales_manager"]).eq("is_active", true).order("full_name")).data ?? [],
  });

  const reassign = useMutation({
    mutationFn: async () => {
      let ok = 0;
      const errors: string[] = [];
      for (const id of selected) {
        const { error } = await supabase.rpc("assign_lead", { _lead_id: id, _to: assignTo || null, _reason: assignTo ? "manual_bulk" : "manual_bulk_auto" });
        if (error) errors.push(error.message); else ok++;
      }
      return { ok, errors };
    },
    onSuccess: ({ ok, errors }) => {
      toast[errors.length ? "warning" : "success"](`${ok} lead riassegnate${errors.length ? ` · ${errors.length} errori: ${errors[0]}` : ""}`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead_open"] });
    },
  });

  const now = Date.now();
  const columns: Column<LeadListRow>[] = [
    { key: "ref", header: "Rif.", cell: (r) => <span className="font-bold">{r.source_ref ?? "—"}</span>, value: (r) => r.source_ref },
    { key: "customer", header: "Cliente", cell: (r) => r.customer ? `${r.customer.first_name} ${r.customer.last_name}` : "—", value: (r) => r.customer ? `${r.customer.last_name} ${r.customer.first_name}` : null },
    { key: "channel", header: "Canale", cell: (r) => CHANNEL[r.channel] ?? r.channel, value: (r) => CHANNEL[r.channel] ?? r.channel },
    { key: "status", header: "Stato", cell: (r) => <Pill tone={statusTone(r.status)}>{LEAD_STATUS[r.status] ?? r.status}</Pill>, value: (r) => LEAD_STATUS[r.status] ?? r.status },
    { key: "temp", header: "Temp.", cell: (r) => r.temperature ? <Pill tone={r.temperature === "hot" ? "hot" : r.temperature === "warm" ? "warn" : "info"}>{TEMP[r.temperature]}</Pill> : "—", value: (r) => r.ai_score },
    { key: "band", header: "Fascia", cell: (r) => r.price_band ?? "—", value: (r) => r.price_band },
    { key: "seller", header: "Venditore", cell: (r) => r.assignee?.full_name ?? <span className="text-muted-foreground">non assegnata</span>, value: (r) => r.assignee?.full_name },
    { key: "plate", header: "Auto", cell: (r) => r.plate ?? "—", value: (r) => r.plate },
    { key: "timer", header: "Timer", cell: (r) => { const t = timeLeft(r.status_deadline_at); return t ? <span className={t.late ? "font-bold text-destructive-ink" : "text-success-ink"}>{t.late ? "−" : ""}{t.text}</span> : "—"; }, value: (r) => r.status_deadline_at ? new Date(r.status_deadline_at).getTime() : null },
    { key: "created", header: "Creata", cell: (r) => fmtDate(r.created_at), value: (r) => r.created_at },
  ];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h1 className="text-2xl">Lead</h1><p className="text-sm text-muted-foreground">{mine ? "Le tue lead" : "Tutte le lead"}</p></div>
        {canCreate && <Link to="/lead/nuova" className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground shadow-glow">+ Nuova lead</Link>}
      </div>
      {q.error && <p className="card p-4 text-sm text-destructive-ink">{(q.error as Error).message}</p>}
      <DataTable
        rows={q.data ?? []} columns={columns} rowKey={(r) => r.id} loading={q.isLoading}
        searchText={(r) => [r.source_ref, r.customer?.first_name, r.customer?.last_name, r.customer?.phone, r.plate, r.interest_text, r.assignee?.full_name].join(" ")}
        searchPlaceholder="Cerca cliente, telefono, targa, riferimento"
        filters={[
          { key: "open", label: "Aperte", test: (r) => !FINAL.includes(r.status) },
          { key: "late", label: "Scadute", test: (r) => !FINAL.includes(r.status) && !!r.status_deadline_at && new Date(r.status_deadline_at).getTime() < now },
          { key: "hot", label: "Calde", test: (r) => r.temperature === "hot" && !FINAL.includes(r.status) },
          { key: "unassigned", label: "Non assegnate", test: (r) => !r.assigned_to && !FINAL.includes(r.status) },
          { key: "won", label: "Vinte", test: (r) => r.status === "won" },
          { key: "lost", label: "Perse", test: (r) => r.status === "lost" },
        ]}
        initialSort={{ key: "created", dir: "desc" }}
        onRowClick={(r) => nav(`/lead/${r.id}`)}
        mobileRow={(r) => <LeadRow lead={r} />}
        selectable={canAssign} selected={selected} onSelectedChange={setSelected}
        bulkActions={canAssign && (
          <>
            <select value={assignTo} onChange={(e) => setAssignTo(e.target.value)} aria-label="Assegna a" className="h-9 rounded-lg border border-input bg-card px-2 text-sm">
              <option value="">assegnazione automatica</option>
              {(sellers.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.full_name}{s.role === "sales_manager" ? " (responsabile)" : s.is_available ? "" : " (non disponibile)"}</option>)}
            </select>
            <Button size="sm" onClick={() => reassign.mutate()} disabled={reassign.isPending}>{reassign.isPending ? "Riassegno…" : "Riassegna"}</Button>
          </>
        )}
        exportName="lead"
      />
    </>
  );
}
