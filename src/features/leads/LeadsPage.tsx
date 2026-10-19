import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { LeadRow, type LeadOpen } from "./LeadRow";
import { cn } from "@/lib/utils";

const FILTERS: Array<[string, string]> = [["open", "Aperte"], ["hot", "Calde"], ["warm", "Tiepide"], ["ai_qualifying", "IA in corso"], ["negotiating", "In trattativa"]];

export function LeadsPage() {
  const { profile } = useAuth();
  const [filter, setFilter] = useState("open");
  const mine = profile?.role === "salesperson";

  const q = useQuery({
    queryKey: ["lead_open", mine ? profile?.id : "all"],
    queryFn: async () => {
      let qb = supabase.from("lead_open").select("*").not("source_ref", "is", null).order("status_deadline_at", { ascending: true, nullsFirst: false }).limit(200);
      if (mine && profile) qb = qb.eq("assigned_to", profile.id);
      const { data, error } = await qb;
      if (error) throw error;
      return (data ?? []) as LeadOpen[];
    },
  });

  const rows = (q.data ?? []).filter((l) => filter === "open" || l.temperature === filter || l.status === filter);

  return (
    <>
      <div><h1 className="text-2xl">Lead</h1><p className="text-sm text-muted-foreground">{rows.length} lead · {mine ? "solo le tue" : "tutte"}</p></div>
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {FILTERS.map(([k, n]) => (
          <button key={k} onClick={() => setFilter(k)} className={cn("shrink-0 rounded-full border border-input bg-card px-3.5 py-1.5 text-sm font-semibold", filter === k && "border-primary bg-primary text-primary-foreground")}>{n}</button>
        ))}
      </div>
      {q.error && <p className="card p-4 text-sm text-destructive-ink">{(q.error as Error).message}</p>}
      <section className="card overflow-hidden">
        {rows.map((l) => <LeadRow key={l.id} lead={l} />)}
        {!q.isLoading && rows.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nessuna lead con questo filtro.</p>}
      </section>
    </>
  );
}
