import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { callFunction, supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { savePhoto, usePhotoUrls } from "@/lib/photos";
import { Button } from "@/components/ui/button";
import { Pill, type Tone } from "@/components/ui/pill";
import { fmtDateTime } from "@/lib/utils";
import { DAMAGE, DOCUMENTS, FUEL, PHASE, SEVERITY, TIRE_STATE, TIRES, WARNING_LIGHTS, diffConditions, zoneLabel, type AiReview, type Condition, type Damage } from "./conditions";

const KIND: Record<string, string> = { new_damage: "Danno nuovo", repaired: "Riparato", worse: "Peggiorato", fuel: "Carburante", mileage: "Chilometri", other: "Da verificare" };
const CONF: Record<string, Tone> = { high: "bad", medium: "warn", low: "muted" };

/** Scheda di un check: dati, danni, foto, confronto con il check precedente e revisione IA delle foto. */
export function ConditionDetailPage() {
  const { id, cid } = useParams();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const canWrite = !!profile && ["admin", "used_manager", "reconditioning", "yard"].includes(profile.role);
  const canAi = canWrite || profile?.role === "sales_manager";
  const [adding, setAdding] = useState(false);

  const q = useQuery({
    queryKey: ["vehicle", id, "condition", cid],
    queryFn: async () => {
      const [veh, all] = await Promise.all([
        supabase.from("vehicle_public").select("id,plate,make,model").eq("id", id!).single(),
        supabase.from("vehicle_condition").select("*").eq("vehicle_id", id!).order("taken_at"),
      ]);
      if (veh.error) throw veh.error;
      const list = (all.data ?? []) as Condition[];
      const idx = list.findIndex((c) => c.id === cid);
      if (idx < 0) throw new Error("check non trovato");
      const cur = list[idx], prev = idx > 0 ? list[idx - 1] : null;
      const ids = [cur.id, prev?.id].filter(Boolean) as string[];
      const [dmg, ph, who] = await Promise.all([
        supabase.from("vehicle_damage").select("condition_id,zone,damage_type,severity,notes,repaired").in("condition_id", ids),
        supabase.from("vehicle_photo").select("id,storage_path,kind,zone,taken_at").eq("condition_id", cur.id).order("taken_at"),
        cur.taken_by ? supabase.from("profile").select("full_name").eq("id", cur.taken_by).maybeSingle() : null,
      ]);
      const d = (dmg.data ?? []) as Array<Damage & { condition_id: string }>;
      return {
        vehicle: veh.data, cur, prev, by: who?.data?.full_name ?? null,
        curDamages: d.filter((x) => x.condition_id === cur.id), prevDamages: d.filter((x) => x.condition_id === prev?.id),
        photos: ph.data ?? [],
      };
    },
  });
  const urls = usePhotoUrls((q.data?.photos ?? []).map((p) => p.storage_path).filter((p) => !p.startsWith("demo/")));

  const ai = useMutation({
    mutationFn: () => callFunction<AiReview>("vision", { action: "compare", vehicle_id: id, from_condition_id: q.data!.prev!.id, to_condition_id: cid }),
    onSuccess: (r) => { toast.success(r.mock ? "Confronto di prova fatto (IA non attiva)" : "Revisione IA delle foto pronta"); qc.invalidateQueries({ queryKey: ["vehicle", id, "condition", cid] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  async function addPhoto(file: File | null) {
    if (!file || !id || !cid) return;
    setAdding(true);
    try {
      const r = await savePhoto(file, { vehicle_id: id, condition_id: cid, kind: "extra", zone: null });
      toast.success(r.queued ? "Foto in coda: parte quando torna la connessione" : "Foto aggiunta");
      qc.invalidateQueries({ queryKey: ["vehicle", id, "condition", cid] });
    } catch (e) { toast.error((e as Error).message); } finally { setAdding(false); }
  }

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Carico…</p>;
  if (q.error || !q.data) return <p className="card p-4 text-sm text-destructive-ink">{(q.error as Error)?.message ?? "Check non trovato."}</p>;
  const { vehicle, cur, prev, curDamages, prevDamages, photos } = q.data;
  const diff = prev ? diffConditions({ c: prev, d: prevDamages }, { c: cur, d: curDamages }) : null;
  const review = cur.ai_review;

  return (
    <>
      <Link to={`/auto/${id}`} className="text-sm font-bold text-primary">‹ {vehicle.plate}</Link>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h1 className="text-2xl">Check {PHASE[cur.phase]?.toLowerCase()}</h1><p className="text-sm text-muted-foreground">{vehicle.make} {vehicle.model} · {fmtDateTime(cur.taken_at)}{q.data.by ? ` · ${q.data.by}` : ""}</p></div>
        {canWrite && <Link to={`/auto/${id}/check`}><Button size="sm" variant="outline">Nuovo check</Button></Link>}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card p-4"><h3 className="text-base">Dati</h3>
          <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Chilometri</dt><dd className="text-right font-semibold">{cur.mileage_km?.toLocaleString("it-IT") ?? "—"}</dd>
            <dt className="text-muted-foreground">Carburante</dt><dd className="text-right font-semibold">{cur.fuel_level ? FUEL[cur.fuel_level] : "—"}</dd>
            <dt className="text-muted-foreground">Chiavi</dt><dd className="text-right font-semibold">{cur.keys_count ?? "—"}</dd>
            <dt className="text-muted-foreground">Documenti</dt><dd className="text-right font-semibold">{Object.entries(cur.documents ?? {}).filter(([, v]) => v).map(([k]) => DOCUMENTS[k] ?? k).join(", ") || "—"}</dd>
            <dt className="text-muted-foreground">Spie</dt><dd className="text-right font-semibold">{(cur.warning_lights ?? []).map((l) => WARNING_LIGHTS[l] ?? l).join(", ") || "nessuna"}</dd>
            <dt className="text-muted-foreground">Pneumatici</dt><dd className="text-right font-semibold">{Object.entries(cur.tires ?? {}).map(([k, t]) => `${TIRES[k] ?? k} ${TIRE_STATE[t.state]?.toLowerCase() ?? t.state}${t.mm ? ` ${t.mm} mm` : ""}`).join(" · ") || "—"}</dd>
          </dl>
          {cur.notes && <p className="mt-3 rounded-xl bg-secondary p-3 text-sm">{cur.notes}</p>}
        </section>

        <section className="card p-4"><h3 className="text-base">Danni</h3>
          <ul className="mt-2 text-sm">
            {curDamages.map((d, i) => (
              <li key={i} className="flex items-center justify-between gap-2 border-t border-border py-2 first:border-t-0">
                <span><b>{zoneLabel(d.zone)}</b> · {DAMAGE[d.damage_type]} {SEVERITY[d.severity]?.toLowerCase()}{d.notes ? ` · ${d.notes}` : ""}</span>
                {d.repaired ? <Pill tone="ok">riparato</Pill> : <Pill tone={d.severity === "severe" ? "bad" : d.severity === "medium" ? "warn" : "muted"}>{SEVERITY[d.severity]}</Pill>}
              </li>
            ))}
            {curDamages.length === 0 && <li className="text-muted-foreground">Nessun danno.</li>}
          </ul>
        </section>
      </div>

      {diff && prev && (
        <section className="card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base">Confronto con il check {PHASE[prev.phase]?.toLowerCase()} del {fmtDateTime(prev.taken_at)}</h3>
            {canAi && <Button size="sm" variant="outline" onClick={() => ai.mutate()} disabled={ai.isPending}><Sparkles className="h-4 w-4" />{ai.isPending ? "Analizzo le foto…" : review ? "Rifai la revisione IA" : "Revisione IA delle foto"}</Button>}
          </div>
          <ul className="mt-3 space-y-1.5 text-sm">
            <li>{diff.newDamages.length ? <><Pill tone="bad">{diff.newDamages.length} danni nuovi</Pill> {diff.newDamages.map((d) => `${zoneLabel(d.zone)} (${DAMAGE[d.damage_type].toLowerCase()})`).join(", ")}</> : <Pill tone="ok">nessun danno nuovo</Pill>}</li>
            {diff.repaired.length > 0 && <li><Pill tone="ok">{diff.repaired.length} riparati</Pill> {diff.repaired.map((d) => zoneLabel(d.zone)).join(", ")}</li>}
            <li>Carburante {prev.fuel_level ? FUEL[prev.fuel_level] : "?"} → {cur.fuel_level ? FUEL[cur.fuel_level] : "?"} {diff.fuelChanged && <Pill tone="warn">cambiato</Pill>}</li>
            <li>Chilometri +{diff.mileageDelta} {diff.mileageUnjustified && <Pill tone="warn">oltre 50 km: verificare se giustificati da una lavorazione</Pill>}</li>
          </ul>
          {review && (
            <div className="mt-4 rounded-xl bg-primary/5 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><b>Revisione IA</b>{review.mock && <Pill>di prova</Pill>}{review.at && <span className="text-xs text-muted-foreground">{fmtDateTime(review.at)}</span>}</div>
              <p className="mt-1">{review.summary}</p>
              <ul className="mt-2 space-y-1">
                {review.findings.map((f, i) => <li key={i} className="flex flex-wrap items-center gap-2"><Pill tone={CONF[f.confidence] ?? "muted"}>{KIND[f.kind] ?? f.kind}</Pill><b>{zoneLabel(f.zone)}</b><span>{f.description}</span></li>)}
                {review.findings.length === 0 && <li className="text-muted-foreground">Nessuna differenza trovata.</li>}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">Sono proposte da controllare: la conferma resta di una persona.</p>
            </div>
          )}
        </section>
      )}

      <section className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base">Foto ({photos.length})</h3>
          {canWrite && <label className="inline-flex min-h-9 cursor-pointer items-center rounded-full border border-input bg-card px-3.5 text-sm font-bold">{adding ? "Carico…" : "+ Foto"}<input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => addPhoto(e.target.files?.[0] ?? null)} /></label>}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {photos.map((p) => {
            const url = urls.data?.[p.storage_path];
            return (
              <a key={p.id} href={url} target="_blank" rel="noreferrer" className="group relative block aspect-[4/3] overflow-hidden rounded-xl bg-muted">
                {url ? <img src={url} alt={zoneLabel(p.zone)} loading="lazy" className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center p-2 text-center text-xs text-muted-foreground">{p.storage_path.startsWith("demo/") ? "foto demo" : "carico…"}</span>}
                <span className="absolute inset-x-1 bottom-1 truncate rounded-full bg-card/90 px-2 py-0.5 text-[11px] font-bold">{p.kind === "damage" ? "Danno · " : ""}{zoneLabel(p.zone)}</span>
              </a>
            );
          })}
          {photos.length === 0 && <p className="text-sm text-muted-foreground">Nessuna foto.</p>}
        </div>
      </section>
    </>
  );
}
