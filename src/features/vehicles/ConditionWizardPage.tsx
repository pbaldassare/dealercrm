import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, Check, Sparkles, Trash2 } from "lucide-react";
import { callFunction, supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { savePhoto } from "@/lib/photos";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Pill } from "@/components/ui/pill";
import { cn } from "@/lib/utils";
import { DAMAGE, DOCUMENTS, FUEL, PHASE, REQUIRED_PHOTOS, SEVERITY, TIRE_STATE, TIRES, WARNING_LIGHTS, ZONES, type Damage } from "./conditions";

interface DamageDraft extends Damage { key: string; existing: boolean; photo: File | null }
const STEPS = ["Fase e cruscotto", "Chiavi, documenti, spie", "Pneumatici", "Danni", "Foto", "Riepilogo"];

/** Foto scattata dal telefono: input con fotocamera posteriore e anteprima. */
function PhotoInput({ label, file, onChange, required }: { label: string; file: File | null; onChange: (f: File | null) => void; required?: boolean }) {
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => { if (!file) { setPreview(null); return; } const u = URL.createObjectURL(file); setPreview(u); return () => URL.revokeObjectURL(u); }, [file]);
  return (
    <label className={cn("relative flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border-2 border-dashed text-center text-xs font-bold",
      file ? "border-success bg-success/5" : required ? "border-primary/60 text-primary" : "border-input text-muted-foreground")}>
      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
      {preview ? <img src={preview} alt={label} className="absolute inset-0 h-full w-full object-cover" /> : <Camera className="h-5 w-5" />}
      <span className={cn("relative z-10 rounded-full px-2 py-0.5", preview && "bg-card/90 text-foreground")}>{label}{file && <Check className="ml-1 inline h-3 w-3 text-success-ink" />}</span>
    </label>
  );
}

/**
 * Check delle condizioni a passi (sezione 6): carburante e km (con foto del cruscotto e lettura IA), chiavi, documenti, spie,
 * pneumatici, danni per zona con foto, foto obbligatorie. I danni del check precedente si ripropongono per segnare le riparazioni.
 */
export function ConditionWizardPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState("intake");
  const [fuel, setFuel] = useState("");
  const [km, setKm] = useState("");
  const [keys, setKeys] = useState("2");
  const [docs, setDocs] = useState<Record<string, boolean>>({});
  const [lights, setLights] = useState<string[]>([]);
  const [tires, setTires] = useState<Record<string, { state: string; mm: string }>>(Object.fromEntries(Object.keys(TIRES).map((k) => [k, { state: "good", mm: "" }])));
  const [damages, setDamages] = useState<DamageDraft[]>([]);
  const [photos, setPhotos] = useState<Record<string, File | null>>({});
  const [notes, setNotes] = useState("");
  const [dashPath, setDashPath] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  const v = useQuery({
    queryKey: ["check-refs", id],
    queryFn: async () => {
      const [veh, last] = await Promise.all([
        supabase.from("vehicle_public").select("id,plate,make,model,mileage_km,status").eq("id", id!).single(),
        supabase.from("vehicle_condition").select("id,phase,mileage_km,fuel_level,keys_count").eq("vehicle_id", id!).order("taken_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (veh.error) throw veh.error;
      const prevDamages = last.data ? (await supabase.from("vehicle_damage").select("zone,damage_type,severity,notes,repaired").eq("condition_id", last.data.id)).data ?? [] : [];
      return { vehicle: veh.data, last: last.data, prevDamages: prevDamages as Damage[] };
    },
  });
  // proposte dal check precedente: fase successiva, km, chiavi, danni ancora aperti
  useEffect(() => {
    const d = v.data;
    if (!d) return;
    if (d.last) setPhase(d.last.phase === "intake" ? "during" : "delivery");
    setKm(String(d.last?.mileage_km ?? d.vehicle.mileage_km ?? ""));
    if (d.last?.keys_count != null) setKeys(String(d.last.keys_count));
    setDamages(d.prevDamages.filter((x) => !x.repaired).map((x, i) => ({ ...x, key: `prev-${i}`, existing: true, photo: null })));
  }, [v.data]);

  const needAllPhotos = phase !== "during";
  const missing = useMemo(() => {
    const m: string[] = [];
    if (!fuel) m.push("carburante");
    if (!km.trim()) m.push("chilometri");
    if (needAllPhotos) Object.entries(REQUIRED_PHOTOS).forEach(([k, l]) => { if (!photos[k] && !(k === "dashboard" && dashPath)) m.push(`foto ${l.toLowerCase()}`); });
    damages.filter((d) => !d.existing && !d.photo).forEach((d) => m.push(`foto del danno ${ZONES[d.zone] ?? d.zone}`));
    return m;
  }, [fuel, km, photos, damages, needAllPhotos, dashPath]);

  // foto del cruscotto: si carica subito, così l'IA può leggere km e carburante
  async function onDashboard(file: File | null) {
    setPhotos((p) => ({ ...p, dashboard: file }));
    setDashPath(null);
    if (!file || !id) return;
    try {
      const r = await savePhoto(file, { vehicle_id: id, condition_id: null, kind: "required", zone: "dashboard" });
      setDashPath(r.path);
      if (r.queued) toast("Senza rete: la foto del cruscotto partirà quando torna la connessione");
    } catch (e) { toast.error((e as Error).message); }
  }
  async function readDashboard() {
    if (!dashPath) return;
    setReading(true);
    try {
      const r = await callFunction<{ mock: boolean; mileage_km: number | null; fuel_level: string | null; warning_lights: string[]; notes: string }>("vision", { action: "read_dashboard", vehicle_id: id, path: dashPath });
      if (r.mock) toast(r.notes);
      if (r.mileage_km != null) setKm(String(r.mileage_km));
      if (r.fuel_level) setFuel(r.fuel_level);
      if (!r.mock) toast.success(`Letto dal cruscotto: ${r.mileage_km ?? "?"} km, carburante ${r.fuel_level ? FUEL[r.fuel_level] : "?"}${r.notes ? ` · ${r.notes}` : ""}. Controlla prima di salvare.`);
    } catch (e) { toast.error((e as Error).message); } finally { setReading(false); }
  }

  async function save() {
    if (!id || !profile) return;
    if (missing.length) { toast.error(`Manca: ${missing.slice(0, 4).join(", ")}${missing.length > 4 ? "…" : ""}`); return; }
    setSaving("Salvo il check…");
    try {
      const { data: c, error } = await supabase.from("vehicle_condition").insert({
        vehicle_id: id, phase, taken_by: profile.id, fuel_level: fuel, mileage_km: Number(km.replace(/\D/g, "")), keys_count: Number(keys) || 0,
        documents: docs, warning_lights: lights, tires: Object.fromEntries(Object.entries(tires).map(([k, t]) => [k, { state: t.state, mm: t.mm ? Number(t.mm.replace(",", ".")) : null }])),
        notes: notes.trim() || null,
      }).select("id").single();
      if (error) throw error;
      if (damages.length) {
        const { error: dErr } = await supabase.from("vehicle_damage").insert(damages.map((d) => ({ condition_id: c.id, zone: d.zone, damage_type: d.damage_type, severity: d.severity, notes: d.notes, repaired: d.repaired })));
        if (dErr) throw dErr;
      }
      if (dashPath) await supabase.from("vehicle_photo").update({ condition_id: c.id }).eq("storage_path", dashPath);
      const uploads: Array<[File, string, string]> = [
        ...Object.entries(photos).filter(([k, f]) => f && !(k === "dashboard" && dashPath)).map(([k, f]) => [f!, "required", k] as [File, string, string]),
        ...damages.filter((d) => d.photo).map((d) => [d.photo!, "damage", d.zone] as [File, string, string]),
      ];
      let queued = 0, failed = 0;
      for (let i = 0; i < uploads.length; i++) {
        setSaving(`Carico le foto ${i + 1}/${uploads.length}…`);
        const [file, kind, zone] = uploads[i];
        try { if ((await savePhoto(file, { vehicle_id: id, condition_id: c.id, kind, zone })).queued) queued++; } catch { failed++; }
      }
      qc.invalidateQueries({ queryKey: ["vehicle"] });
      qc.invalidateQueries({ queryKey: ["vehicle_alert"] });
      if (failed) toast.warning(`Check salvato, ma ${failed} foto non sono partite: aggiungile dalla scheda del check`);
      else if (queued) toast(`Check salvato: ${queued} foto partiranno quando torna la connessione`);
      else toast.success("Check salvato");
      nav(`/auto/${id}/check/${c.id}`, { replace: true });
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(null); }
  }

  if (v.isLoading) return <p className="text-sm text-muted-foreground">Carico…</p>;
  if (v.error || !v.data) return <p className="card p-4 text-sm text-destructive-ink">Auto non trovata.</p>;
  const veh = v.data.vehicle;
  const toggle = (list: string[], k: string) => (list.includes(k) ? list.filter((x) => x !== k) : [...list, k]);
  const chip = (on: boolean) => cn("rounded-full border border-input px-3 py-1.5 text-sm font-semibold", on && "border-primary bg-primary text-primary-foreground");

  return (
    <>
      <Link to={`/auto/${id}`} className="text-sm font-bold text-primary">‹ {veh.plate}</Link>
      <div><h1 className="text-2xl">Check condizioni</h1><p className="text-sm text-muted-foreground">{veh.make} {veh.model} · {veh.plate}{v.data.last ? ` · ultimo check: ${PHASE[v.data.last.phase]}` : " · primo check"}</p></div>

      <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
        {STEPS.map((s, i) => <button key={s} onClick={() => setStep(i)} className={cn("shrink-0 rounded-full px-3 py-1.5 text-xs font-bold", i === step ? "bg-primary text-primary-foreground" : i < step ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground")}>{i + 1}. {s}</button>)}
      </div>

      <section className="card space-y-4 p-4">
        {step === 0 && (<>
          <div><Label>Fase</Label><div className="flex flex-wrap gap-2">{Object.entries(PHASE).map(([k, l]) => <button key={k} type="button" onClick={() => setPhase(k)} className={chip(phase === k)}>{l}</button>)}</div></div>
          <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
            <PhotoInput label="Cruscotto acceso" file={photos.dashboard ?? null} onChange={onDashboard} required={needAllPhotos} />
            <div className="space-y-3">
              <Button type="button" variant="outline" size="sm" onClick={readDashboard} disabled={!dashPath || reading}><Sparkles className="h-4 w-4" />{reading ? "Leggo…" : "Leggi km e carburante dalla foto"}</Button>
              <div><Label htmlFor="km">Chilometri</Label><Input id="km" inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} /></div>
              <div><Label>Carburante</Label><div className="flex flex-wrap gap-2">{Object.entries(FUEL).map(([k, l]) => <button key={k} type="button" onClick={() => setFuel(k)} className={chip(fuel === k)}>{l}</button>)}</div></div>
            </div>
          </div>
        </>)}

        {step === 1 && (<>
          <div className="w-32"><Label htmlFor="keys">Chiavi consegnate</Label><Input id="keys" inputMode="numeric" value={keys} onChange={(e) => setKeys(e.target.value)} /></div>
          <div><Label>Documenti presenti</Label><div className="flex flex-wrap gap-2">{Object.entries(DOCUMENTS).map(([k, l]) => <button key={k} type="button" onClick={() => setDocs((d) => ({ ...d, [k]: !d[k] }))} className={chip(Boolean(docs[k]))}>{l}</button>)}</div></div>
          <div><Label>Spie accese</Label><div className="flex flex-wrap gap-2">{Object.entries(WARNING_LIGHTS).map(([k, l]) => <button key={k} type="button" onClick={() => setLights((x) => toggle(x, k))} className={chip(lights.includes(k))}>{l}</button>)}</div>
            {lights.length === 0 && <p className="mt-1 text-xs text-muted-foreground">Nessuna spia accesa.</p>}</div>
        </>)}

        {step === 2 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {Object.entries(TIRES).map(([k, l]) => (
              <div key={k} className="rounded-xl border border-border p-3">
                <div className="mb-2 font-bold">{l}</div>
                <div className="flex flex-wrap items-center gap-2">
                  {Object.entries(TIRE_STATE).map(([s, sl]) => <button key={s} type="button" onClick={() => setTires((t) => ({ ...t, [k]: { ...t[k], state: s } }))} className={chip(tires[k].state === s)}>{sl}</button>)}
                  <Input aria-label={`Battistrada ${l} in mm`} placeholder="mm" inputMode="decimal" value={tires[k].mm} onChange={(e) => setTires((t) => ({ ...t, [k]: { ...t[k], mm: e.target.value } }))} className="h-9 w-20" />
                </div>
              </div>
            ))}
          </div>
        )}

        {step === 3 && (<>
          {damages.map((d, i) => (
            <div key={d.key} className="space-y-2 rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b>{ZONES[d.zone] ?? d.zone}{d.existing && <Pill className="ml-2">dal check precedente</Pill>}</b>
                {d.existing
                  ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={d.repaired} onChange={(e) => setDamages((x) => x.map((y, j) => j === i ? { ...y, repaired: e.target.checked } : y))} className="h-4 w-4 accent-[hsl(var(--primary))]" />Riparato</label>
                  : <button type="button" aria-label="Rimuovi il danno" onClick={() => setDamages((x) => x.filter((_, j) => j !== i))} className="rounded-full p-1.5 text-muted-foreground hover:text-destructive-ink"><Trash2 className="h-4 w-4" /></button>}
              </div>
              {!d.existing && (<>
                <div className="grid gap-2 sm:grid-cols-3">
                  <select aria-label="Zona" value={d.zone} onChange={(e) => setDamages((x) => x.map((y, j) => j === i ? { ...y, zone: e.target.value } : y))} className="h-10 rounded-lg border border-input bg-card px-2 text-sm">{Object.entries(ZONES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                  <select aria-label="Tipo di danno" value={d.damage_type} onChange={(e) => setDamages((x) => x.map((y, j) => j === i ? { ...y, damage_type: e.target.value } : y))} className="h-10 rounded-lg border border-input bg-card px-2 text-sm">{Object.entries(DAMAGE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                  <select aria-label="Gravità" value={d.severity} onChange={(e) => setDamages((x) => x.map((y, j) => j === i ? { ...y, severity: e.target.value } : y))} className="h-10 rounded-lg border border-input bg-card px-2 text-sm">{Object.entries(SEVERITY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                </div>
                <div className="grid gap-2 sm:grid-cols-[160px_1fr]">
                  <PhotoInput label="Foto del danno" file={d.photo} required onChange={(f) => setDamages((x) => x.map((y, j) => j === i ? { ...y, photo: f } : y))} />
                  <Input aria-label="Note sul danno" placeholder="note (facoltative)" value={d.notes ?? ""} onChange={(e) => setDamages((x) => x.map((y, j) => j === i ? { ...y, notes: e.target.value || null } : y))} />
                </div>
              </>)}
              {d.existing && <p className="text-xs text-muted-foreground">{DAMAGE[d.damage_type]} {SEVERITY[d.severity]?.toLowerCase()}{d.notes ? ` · ${d.notes}` : ""}</p>}
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setDamages((x) => [...x, { key: crypto.randomUUID(), zone: "front_bumper", damage_type: "scratch", severity: "light", notes: null, repaired: false, existing: false, photo: null }])}>+ Aggiungi danno</Button>
          {damages.length === 0 && <p className="text-sm text-muted-foreground">Nessun danno: se l'auto ne ha, aggiungili uno per uno con la foto.</p>}
        </>)}

        {step === 4 && (<>
          <p className="text-sm text-muted-foreground">{needAllPhotos ? "Foto obbligatorie per il check di ingresso e di consegna." : "Durante la lavorazione le foto sono facoltative."} Si riducono prima dell'invio; senza rete partono appena torna la connessione.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {Object.entries(REQUIRED_PHOTOS).map(([k, l]) => k === "dashboard"
              ? <PhotoInput key={k} label={l} file={photos.dashboard ?? null} onChange={onDashboard} required={needAllPhotos} />
              : <PhotoInput key={k} label={l} file={photos[k] ?? null} onChange={(f) => setPhotos((p) => ({ ...p, [k]: f }))} required={needAllPhotos} />)}
          </div>
        </>)}

        {step === 5 && (<>
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Fase</dt><dd className="text-right font-semibold">{PHASE[phase]}</dd>
            <dt className="text-muted-foreground">Chilometri</dt><dd className="text-right font-semibold">{km || "—"}{v.data.last?.mileage_km != null && km && Number(km) - v.data.last.mileage_km > 50 && <Pill tone="warn" className="ml-2">+{Number(km) - v.data.last.mileage_km} km</Pill>}</dd>
            <dt className="text-muted-foreground">Carburante</dt><dd className="text-right font-semibold">{fuel ? FUEL[fuel] : "—"}</dd>
            <dt className="text-muted-foreground">Chiavi · spie</dt><dd className="text-right font-semibold">{keys} · {lights.length ? lights.map((l) => WARNING_LIGHTS[l]).join(", ") : "nessuna"}</dd>
            <dt className="text-muted-foreground">Danni</dt><dd className="text-right font-semibold">{damages.filter((d) => !d.existing).length} nuovi · {damages.filter((d) => d.repaired).length} riparati</dd>
            <dt className="text-muted-foreground">Foto</dt><dd className="text-right font-semibold">{Object.values(photos).filter(Boolean).length + damages.filter((d) => d.photo).length}</dd>
          </dl>
          <div><Label htmlFor="notes">Note</Label><Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          {missing.length > 0 && <p className="rounded-xl bg-warning/15 p-3 text-sm text-warning-ink">Manca: {missing.join(", ")}.</p>}
        </>)}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0 || Boolean(saving)}>Indietro</Button>
        {step < STEPS.length - 1
          ? <Button onClick={() => setStep(step + 1)}>Avanti</Button>
          : <Button onClick={save} disabled={Boolean(saving)}>{saving ?? "Salva il check"}</Button>}
      </div>
    </>
  );
}
