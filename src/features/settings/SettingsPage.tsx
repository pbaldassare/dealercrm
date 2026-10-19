import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Toggle } from "@/components/ui/toggle";
import { fmtDateTime } from "@/lib/utils";

interface Setting { id: string; key: string; value: Record<string, unknown>; updated_at: string | null }

/** Parametri modificabili dall'app: ogni salvataggio scrive setting.value; il trigger record_setting_history tiene lo storico. */
export function SettingsPage() {
  const qc = useQueryClient();
  const settings = useQuery({
    queryKey: ["setting"],
    queryFn: async () => { const { data, error } = await supabase.from("setting").select("*"); if (error) throw error; return (data ?? []) as Setting[]; },
  });
  const history = useQuery({
    queryKey: ["setting_history"],
    queryFn: async () => { const { data } = await supabase.from("setting_history").select("changed_at,setting_id,old_value,new_value").order("changed_at", { ascending: false }).limit(10); return data ?? []; },
  });
  const save = useMutation({
    mutationFn: async ({ key, patch }: { key: string; patch: (v: Record<string, unknown>) => Record<string, unknown> }) => {
      const row = settings.data?.find((s) => s.key === key);
      if (!row) throw new Error(`Parametro ${key} non trovato`);
      const { error } = await supabase.from("setting").update({ value: patch(row.value), updated_at: new Date().toISOString() }).eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Salvato"); qc.invalidateQueries({ queryKey: ["setting"] }); qc.invalidateQueries({ queryKey: ["setting_history"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const get = (key: string) => (settings.data?.find((s) => s.key === key)?.value ?? {}) as Record<string, unknown>;
  const ai = get("ai_switches"); const timers = get("lead_timers"); const esc = (timers.escalation_assigned_min ?? {}) as Record<string, number>;
  const weights = get("assignment_weights"); const params = get("assignment_params"); const fic = get("fatture_in_cloud"); const maps = get("maps");
  const keyLabel: Record<string, string> = { lead_timers: "Timer lead", ai_switches: "Assistente IA", assignment_weights: "Pesi assegnazione", assignment_params: "Parametri assegnazione", value_bands: "Fasce di valore", vehicle_alerts: "Allerte veicoli", portal_rules: "Regole portali", fatture_in_cloud: "Fatture in Cloud", maps: "Google Maps", ai_handoff: "Passaggio a umano" };

  const Row = ({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) => (
    <div className="flex items-center justify-between gap-4 border-t border-border py-3 first:border-t-0">
      <div><div className="font-bold">{label}</div>{sub && <div className="text-xs text-muted-foreground">{sub}</div>}</div>{children}
    </div>
  );
  const Num = ({ path, keyName, value, unit }: { path: string[]; keyName: string; value: unknown; unit: string }) => (
    <div className="flex items-center gap-1.5 text-sm">
      <input type="number" defaultValue={value as number} id={`n_${path.join("_")}`}
        onBlur={(e) => { const n = Number(e.target.value); if (n !== value) save.mutate({ key: keyName, patch: (v) => setIn(v, path, n) }); }}
        className="h-9 w-20 rounded-lg border border-input bg-card px-2 text-right tabular-nums" /><span>{unit}</span>
    </div>
  );

  if (settings.error) return <p className="card p-4 text-sm text-destructive-ink">{(settings.error as Error).message}</p>;

  return (
    <>
      <div><h1 className="text-2xl">Parametri</h1><p className="text-sm text-muted-foreground">Ogni modifica si salva subito e finisce nello storico</p></div>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="card p-4"><h3 className="text-base">Assistente IA</h3>
          <div className="mt-2">
            {([["voice", "Telefonate", "Risponde e qualifica le chiamate"], ["whatsapp", "WhatsApp", "Risponde con modelli approvati"], ["social", "Social", "Instagram e Facebook"], ["out_of_hours_reply", "Fuori orario", "Risponde anche fuori dall'orario di lavoro"]] as const).map(([k, n, s]) => (
              <Row key={k} label={n} sub={s}><Toggle label={n} checked={Boolean(ai[k])} onChange={(v) => save.mutate({ key: "ai_switches", patch: (x) => ({ ...x, [k]: v }) })} /></Row>
            ))}
          </div>
        </section>
        <section className="card p-4"><h3 className="text-base">Timer lead assegnata</h3>
          <div className="mt-2">
            <Row label="Avviso al venditore" sub="minuti senza presa in carico"><Num keyName="lead_timers" path={["escalation_assigned_min", "warn_salesperson"]} value={esc.warn_salesperson} unit="min" /></Row>
            <Row label="Avviso al responsabile"><Num keyName="lead_timers" path={["escalation_assigned_min", "warn_manager"]} value={esc.warn_manager} unit="min" /></Row>
            <Row label="Riassegnazione automatica"><Num keyName="lead_timers" path={["escalation_assigned_min", "reassign"]} value={esc.reassign} unit="min" /></Row>
            <Row label="Riassegnazioni massime" sub="poi al responsabile"><Num keyName="lead_timers" path={["max_reassignments"]} value={timers.max_reassignments} unit="" /></Row>
            <Row label="Persa automatica" sub="giorni senza attività"><Num keyName="lead_timers" path={["auto_lose_days"]} value={timers.auto_lose_days} unit="gg" /></Row>
          </div>
        </section>
        <section className="card p-4"><h3 className="text-base">Assegnazione</h3>
          <div className="mt-2">
            <Row label="Performance"><Num keyName="assignment_weights" path={["performance"]} value={weights.performance} unit="" /></Row>
            <Row label="Rotazione"><Num keyName="assignment_weights" path={["rotation"]} value={weights.rotation} unit="" /></Row>
            <Row label="Carico"><Num keyName="assignment_weights" path={["load"]} value={weights.load} unit="" /></Row>
            <Row label="Lead aperte per venditore" sub="massimo"><Num keyName="assignment_params" path={["max_open_leads"]} value={params.max_open_leads} unit="" /></Row>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">I pesi sommano a 1 (es. 0,4 + 0,4 + 0,2).</p>
        </section>
        <section className="card p-4"><h3 className="text-base">Integrazioni</h3>
          <div className="mt-2">
            <Row label="Fatture in Cloud attivo" sub={fic.company_id ? `Azienda ${String(fic.company_id)}` : "azienda da collegare"}><Toggle label="Fatture in Cloud" checked={Boolean(fic.enabled)} onChange={(v) => save.mutate({ key: "fatture_in_cloud", patch: (x) => ({ ...x, enabled: v }) })} /></Row>
            <Row label="Fatture in modalità prova" sub="verifica i totali senza creare documenti"><Toggle label="Prova" checked={fic.dry_run !== false} onChange={(v) => save.mutate({ key: "fatture_in_cloud", patch: (x) => ({ ...x, dry_run: v }) })} /></Row>
            <Row label="Google Maps" sub={maps.map_id ? "Map ID impostato" : "Map ID da impostare: la vista a griglia resta attiva"}><span className="text-sm font-semibold">{String(maps.map_type ?? "satellite")}</span></Row>
          </div>
        </section>
      </div>
      <section className="card p-4"><h3 className="text-base">Ultime modifiche</h3>
        <ul className="mt-2 text-sm">
          {(history.data ?? []).map((h: { changed_at: string; setting_id: string }, i: number) => {
            const s = settings.data?.find((x) => x.id === h.setting_id);
            return <li key={i} className="flex justify-between border-t border-border py-2 first:border-t-0"><span>{s ? keyLabel[s.key] ?? s.key : "—"}</span><span className="text-muted-foreground">{fmtDateTime(h.changed_at)}</span></li>;
          })}
          {history.data?.length === 0 && <li className="text-muted-foreground">Nessuna modifica registrata.</li>}
        </ul>
      </section>
    </>
  );
}

function setIn(obj: Record<string, unknown>, path: string[], value: unknown): Record<string, unknown> {
  if (path.length === 1) return { ...obj, [path[0]]: value };
  const [head, ...rest] = path;
  return { ...obj, [head]: setIn((obj[head] as Record<string, unknown>) ?? {}, rest, value) };
}
