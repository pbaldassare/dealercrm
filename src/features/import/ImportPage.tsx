import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { fmtDateTime } from "@/lib/utils";

type Kind = "vehicles" | "customers" | "suppliers" | "leads";
interface Field { key: string; label: string; required?: boolean; type?: "text" | "int" | "money" | "date" | "plate" | "phone" | "email" }

/** Campi di destinazione per tipo. La mappatura colonna → campo si sceglie a schermo e si salva in import_job.mapping. */
const FIELDS: Record<Kind, Field[]> = {
  vehicles: [
    { key: "plate", label: "Targa", required: true, type: "plate" }, { key: "make", label: "Marca", required: true }, { key: "model", label: "Modello", required: true },
    { key: "trim", label: "Allestimento" }, { key: "vin", label: "Telaio" }, { key: "first_registration", label: "Immatricolazione", type: "date" }, { key: "mileage_km", label: "Km", type: "int" },
    { key: "fuel_type", label: "Alimentazione" }, { key: "gearbox", label: "Cambio" }, { key: "power_kw", label: "kW", type: "int" }, { key: "color", label: "Colore" },
    { key: "purchase_cost", label: "Costo acquisto", type: "money" }, { key: "list_price", label: "Prezzo listino", type: "money" }, { key: "sale_price", label: "Prezzo vendita", type: "money" },
    { key: "entry_date", label: "Data ingresso", type: "date" }, { key: "notes", label: "Note" },
  ],
  customers: [
    { key: "last_name", label: "Cognome", required: true }, { key: "first_name", label: "Nome" }, { key: "phone", label: "Telefono", type: "phone" }, { key: "email", label: "E-mail", type: "email" }, { key: "city", label: "Città" },
  ],
  suppliers: [{ key: "name", label: "Nome", required: true }, { key: "vat_number", label: "Partita IVA" }, { key: "payment_terms", label: "Termini di pagamento" }, { key: "notes", label: "Note" }],
  leads: [
    { key: "last_name", label: "Cognome cliente", required: true }, { key: "first_name", label: "Nome cliente" }, { key: "phone", label: "Telefono", type: "phone" }, { key: "email", label: "E-mail", type: "email" },
    { key: "plate", label: "Targa auto", type: "plate" }, { key: "interest_text", label: "Richiesta" }, { key: "created_at", label: "Data", type: "date" }, { key: "status", label: "Stato (won/lost)" },
  ],
};
const KIND_LABEL: Record<Kind, string> = { vehicles: "Veicoli", customers: "Clienti", suppliers: "Fornitori", leads: "Lead storiche" };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
/** Propone la mappatura automatica confrontando l'intestazione con l'etichetta e la chiave del campo. */
function guessMapping(headers: string[], fields: Field[]) {
  const m: Record<string, string> = {};
  for (const f of fields) {
    const hit = headers.find((h) => { const n = norm(h); return n === norm(f.label) || n === norm(f.key) || n.includes(norm(f.label)); });
    if (hit && !Object.values(m).includes(hit)) m[f.key] = hit;
  }
  return m;
}
function parseValue(raw: unknown, type: Field["type"]): { value: unknown; error?: string } {
  if (raw == null || raw === "") return { value: null };
  const s = String(raw).trim();
  switch (type) {
    case "plate": { const p = s.replace(/\s/g, "").toUpperCase(); return /^[A-Z]{2}[0-9]{3}[A-Z]{2}$/.test(p) ? { value: p } : { value: p, error: `targa non valida "${s}"` }; }
    case "int": { const n = parseInt(s.replace(/[.\s]/g, ""), 10); return Number.isFinite(n) ? { value: n } : { value: null, error: `numero non valido "${s}"` }; }
    case "money": { const n = parseFloat(s.replace(/[€\s]/g, "").replace(/\.(?=\d{3})/g, "").replace(",", ".")); return Number.isFinite(n) ? { value: n } : { value: null, error: `importo non valido "${s}"` }; }
    case "date": {
      if (raw instanceof Date) return { value: raw.toISOString().slice(0, 10) };
      if (typeof raw === "number") { const d = XLSX.SSF.parse_date_code(raw); return d ? { value: `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}` } : { value: null, error: "data non valida" }; }
      const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/); if (m) { const y = m[3].length === 2 ? "20" + m[3] : m[3]; return { value: `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` }; }
      return /^\d{4}-\d{2}-\d{2}/.test(s) ? { value: s.slice(0, 10) } : { value: null, error: `data non valida "${s}"` };
    }
    case "phone": { const p = s.replace(/[^\d+]/g, ""); return { value: p.startsWith("+") ? p : p.startsWith("00") ? "+" + p.slice(2) : p.length >= 9 ? "+39" + p : p }; }
    case "email": return { value: s.toLowerCase() };
    default: return { value: s };
  }
}

export function ImportPage() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [kind, setKind] = useState<Kind>("vehicles");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [dupPolicy, setDupPolicy] = useState<"skip" | "update">("skip");
  const fields = FIELDS[kind];

  const jobs = useQuery({ queryKey: ["import_job"], queryFn: async () => { const { data } = await supabase.from("import_job").select("*").order("created_at", { ascending: false }).limit(10); return data ?? []; } });

  async function onFile(file: File) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
    const hs = Object.keys(data[0] ?? {});
    setFileName(file.name); setHeaders(hs); setRows(data); setMapping(guessMapping(hs, fields));
    // Riusa l'ultima mappatura salvata per questo tipo, se le intestazioni coincidono
    const last = jobs.data?.find((j) => j.kind === kind && j.mapping);
    if (last?.mapping && Object.values(last.mapping as Record<string, string>).every((h) => hs.includes(h))) setMapping(last.mapping as Record<string, string>);
  }

  // Prova a vuoto: valida ogni riga e conta valide, scartate e duplicate (sul file stesso)
  const preview = useMemo(() => {
    const seen = new Set<string>();
    return rows.map((r, i) => {
      const out: Record<string, unknown> = {}; const errors: string[] = [];
      for (const f of fields) {
        const col = mapping[f.key]; const { value, error } = parseValue(col ? r[col] : null, f.type);
        if (error) errors.push(error);
        if (f.required && (value == null || value === "")) errors.push(`${f.label} mancante`);
        out[f.key] = value;
      }
      const key = kind === "vehicles" ? String(out.plate ?? "") : kind === "suppliers" ? String(out.name ?? "").toLowerCase() : String(out.phone ?? out.email ?? "");
      const dup = key && seen.has(key); if (key) seen.add(key);
      return { n: i + 2, out, errors, dup };
    });
  }, [rows, mapping, fields, kind]);
  const valid = preview.filter((p) => !p.errors.length && !p.dup), invalid = preview.filter((p) => p.errors.length), dups = preview.filter((p) => p.dup && !p.errors.length);

  const run = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("Profilo mancante");
      const { data: job, error } = await supabase.from("import_job").insert({ dealership_id: profile.dealership_id, kind, file_path: fileName, status: "importing", mapping, total: rows.length, created_by: profile.id }).select("id").single();
      if (error) throw error;
      let done = 0, skipped = 0, dupCount = 0; const rowLog: Array<{ job_id: string; row_no: number; raw: unknown; status: string; error: string | null }> = [];
      for (const p of preview) {
        if (p.errors.length) { skipped++; rowLog.push({ job_id: job.id, row_no: p.n, raw: p.out, status: "error", error: p.errors.join("; ") }); continue; }
        if (p.dup) { dupCount++; rowLog.push({ job_id: job.id, row_no: p.n, raw: p.out, status: "duplicate", error: "duplicato nel file" }); continue; }
        const res = await insertRow(kind, p.out, profile.dealership_id, dupPolicy);
        if (res === "duplicate") { dupCount++; rowLog.push({ job_id: job.id, row_no: p.n, raw: p.out, status: "duplicate", error: "già presente" }); }
        else if (res === "ok") { done++; rowLog.push({ job_id: job.id, row_no: p.n, raw: p.out, status: "valid", error: null }); }
        else { skipped++; rowLog.push({ job_id: job.id, row_no: p.n, raw: p.out, status: "error", error: res }); }
      }
      for (let i = 0; i < rowLog.length; i += 200) await supabase.from("import_row").insert(rowLog.slice(i, i + 200));
      await supabase.from("import_job").update({ status: "done", valid: done, skipped, duplicates: dupCount }).eq("id", job.id);
      return { done, skipped, dupCount };
    },
    onSuccess: (r) => { toast.success(`Importate ${r.done} righe · ${r.skipped} scartate · ${r.dupCount} duplicate`); setRows([]); setHeaders([]); setFileName(""); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const selCls = "h-9 w-full rounded-lg border border-input bg-card px-2 text-sm";
  return (
    <>
      <div><h1 className="text-2xl">Import Excel</h1><p className="text-sm text-muted-foreground">File .xlsx o .csv: anteprima, mappatura delle colonne, prova a vuoto, poi scrittura</p></div>
      <section className="card space-y-3 p-4">
        <div className="flex flex-wrap gap-2">{(Object.keys(FIELDS) as Kind[]).map((k) => <button key={k} onClick={() => { setKind(k); setMapping(guessMapping(headers, FIELDS[k])); }} className={`rounded-full border border-input bg-card px-3.5 py-1.5 text-sm font-semibold ${kind === k ? "border-primary bg-primary text-primary-foreground" : ""}`}>{KIND_LABEL[k]}</button>)}</div>
        <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-input p-6 text-center text-sm hover:bg-muted">
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          <b>{fileName || "Scegli o trascina il file"}</b><span className="text-muted-foreground">{rows.length ? `${rows.length} righe · ${headers.length} colonne` : "il file originale non viene modificato"}</span>
        </label>
      </section>

      {rows.length > 0 && (
        <>
          <section className="card p-4">
            <h3 className="text-base">Mappatura colonne</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {fields.map((f) => (
                <label key={f.key} className="text-sm"><span className="mb-1 block font-semibold">{f.label}{f.required && <span className="text-destructive-ink"> *</span>}</span>
                  <select className={selCls} value={mapping[f.key] ?? ""} onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value })}><option value="">— non importare —</option>{headers.map((h) => <option key={h} value={h}>{h}</option>)}</select></label>
              ))}
            </div>
          </section>
          <section className="card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base">Prova a vuoto</h3>
              <div className="flex gap-2"><Pill tone="ok">{valid.length} valide</Pill><Pill tone="bad">{invalid.length} scartate</Pill><Pill tone="warn">{dups.length} duplicate nel file</Pill></div>
            </div>
            {invalid.length > 0 && <ul className="mt-3 max-h-40 overflow-y-auto text-xs text-muted-foreground">{invalid.slice(0, 50).map((p) => <li key={p.n}>Riga {p.n}: {p.errors.join("; ")}</li>)}</ul>}
            <div className="mt-3 overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-xs"><thead className="bg-muted text-left"><tr>{fields.filter((f) => mapping[f.key]).map((f) => <th key={f.key} className="px-2 py-1.5">{f.label}</th>)}</tr></thead>
                <tbody>{preview.slice(0, 20).map((p) => <tr key={p.n} className={`border-t border-border ${p.errors.length ? "bg-destructive/5" : ""}`}>{fields.filter((f) => mapping[f.key]).map((f) => <td key={f.key} className="whitespace-nowrap px-2 py-1">{String(p.out[f.key] ?? "")}</td>)}</tr>)}</tbody></table>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">Se esiste già:<select className="h-9 rounded-lg border border-input bg-card px-2" value={dupPolicy} onChange={(e) => setDupPolicy(e.target.value as "skip" | "update")}><option value="skip">salta</option><option value="update">aggiorna</option></select></label>
              <Button onClick={() => run.mutate()} disabled={run.isPending || valid.length === 0}>{run.isPending ? "Importo…" : `Importa ${valid.length} righe`}</Button>
            </div>
          </section>
        </>
      )}

      <section className="card overflow-hidden"><div className="px-4 pb-2 pt-4"><h3 className="text-base">Import precedenti</h3></div>
        {(jobs.data ?? []).map((j) => <div key={j.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2 text-sm"><span><b>{KIND_LABEL[j.kind as Kind] ?? j.kind}</b> · {j.file_path}</span><span className="text-muted-foreground">{fmtDateTime(j.created_at)} · {j.valid ?? 0} ok · {j.skipped ?? 0} scartate · {j.duplicates ?? 0} dup.</span></div>)}
        {jobs.data?.length === 0 && <p className="px-4 pb-4 text-sm text-muted-foreground">Nessun import ancora.</p>}
      </section>
    </>
  );
}

async function insertRow(kind: Kind, r: Record<string, unknown>, dealershipId: string, dup: "skip" | "update"): Promise<"ok" | "duplicate" | string> {
  const base = { dealership_id: dealershipId };
  if (kind === "vehicles") {
    const { data: ex } = await supabase.from("vehicle_public").select("id").eq("plate", r.plate as string).maybeSingle();
    const row = { ...base, plate: r.plate, make: r.make, model: r.model, trim: r.trim, vin: r.vin, first_registration: r.first_registration, mileage_km: r.mileage_km, fuel_type: r.fuel_type, gearbox: r.gearbox, power_kw: r.power_kw, color: r.color, purchase_cost: r.purchase_cost, list_price: r.list_price, sale_price: r.sale_price, entry_date: r.entry_date ?? new Date().toISOString().slice(0, 10), notes: r.notes, kind: "used", status: "received" };
    if (ex) { if (dup === "skip") return "duplicate"; const { status: _s, kind: _k, ...upd } = row; const { error } = await supabase.from("vehicle").update(upd).eq("id", ex.id); return error ? error.message : "ok"; }
    const { error } = await supabase.from("vehicle").insert(row); return error ? error.message : "ok";
  }
  if (kind === "suppliers") {
    const { data: ex } = await supabase.from("supplier").select("id").ilike("name", r.name as string).maybeSingle();
    const row = { ...base, name: r.name, vat_number: r.vat_number, payment_terms: r.payment_terms, notes: r.notes, type: "dealer" };
    if (ex) { if (dup === "skip") return "duplicate"; const { error } = await supabase.from("supplier").update(row).eq("id", ex.id); return error ? error.message : "ok"; }
    const { error } = await supabase.from("supplier").insert(row); return error ? error.message : "ok";
  }
  // clienti (e lead storiche: prima il cliente)
  let q = supabase.from("customer").select("id");
  q = r.phone ? q.eq("phone", r.phone as string) : q.eq("email", (r.email as string) ?? "");
  const { data: ex } = (r.phone || r.email) ? await q.maybeSingle() : { data: null };
  const crow = { ...base, first_name: r.first_name ?? "", last_name: r.last_name, phone: r.phone, email: r.email, city: r.city };
  let customerId = ex?.id as string | undefined;
  if (ex) { if (kind === "customers" && dup === "skip") return "duplicate"; if (dup === "update") await supabase.from("customer").update(crow).eq("id", ex.id); }
  else { const { data, error } = await supabase.from("customer").insert(crow).select("id").single(); if (error) return error.message; customerId = data.id; }
  if (kind === "customers") return "ok";
  let vehicleId: string | null = null;
  if (r.plate) { const { data: v } = await supabase.from("vehicle_public").select("id").eq("plate", r.plate as string).maybeSingle(); vehicleId = v?.id ?? null; }
  const st = String(r.status ?? "").toLowerCase();
  const status = st.startsWith("w") || st.startsWith("v") ? "won" : st.startsWith("l") || st.startsWith("p") ? "lost" : "contacted";
  const { error } = await supabase.from("lead").insert({ ...base, customer_id: customerId, vehicle_id: vehicleId, channel: "other_portal", source_ref: "IMPORT", interest_text: r.interest_text, status, status_changed_at: r.created_at ?? new Date().toISOString(), created_at: r.created_at ?? undefined, lost_reason: status === "lost" ? "other" : null });
  return error ? error.message : "ok";
}
