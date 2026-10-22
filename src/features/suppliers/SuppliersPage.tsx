import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { DataTable, type Column } from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Pill, type Tone } from "@/components/ui/pill";
import { fmtEur } from "@/lib/utils";
import { VSTATUS } from "@/features/vehicles/VehiclesPage";

export const SUPPLIER_TYPE: Record<string, string> = {
  private: "Privato", customer_trade_in: "Permuta cliente", auction: "Asta", dealer: "Commerciante", import: "Importazione", rental_company: "Noleggio",
};
interface Supplier { id: string; name: string; type: string; vat_number: string | null; payment_terms: string | null; reliability: number | null; notes: string | null; contacts: { phone?: string; email?: string; person?: string } | null }
interface Stats { supplier_id: string; vehicles: number; sold: number; in_stock: number; avg_days_to_sell: number | null; avg_margin: number | null }
const stars = (n: number | null) => (n ? "★".repeat(n) + "☆".repeat(5 - n) : "—");

/** Fornitori (sezione 6): auto fornite, tempo medio di vendita, margine medio, affidabilità. */
export function SuppliersPage() {
  const nav = useNavigate();
  const { profile } = useAuth();
  const canWrite = profile?.role === "admin" || profile?.role === "used_manager";
  const q = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const [s, st] = await Promise.all([supabase.from("supplier").select("*").order("name"), supabase.from("supplier_stats").select("*")]);
      if (s.error) throw s.error;
      const stats = new Map(((st.data ?? []) as Stats[]).map((x) => [x.supplier_id, x]));
      return (s.data as Supplier[]).map((x) => ({ ...x, stats: stats.get(x.id) }));
    },
  });
  type Row = NonNullable<typeof q.data>[number];
  const columns: Column<Row>[] = [
    { key: "name", header: "Fornitore", cell: (s) => <b>{s.name}</b>, value: (s) => s.name },
    { key: "type", header: "Tipo", cell: (s) => SUPPLIER_TYPE[s.type] ?? s.type, value: (s) => SUPPLIER_TYPE[s.type] ?? s.type },
    { key: "rel", header: "Affidabilità", cell: (s) => <span className="tracking-wider text-warning-ink">{stars(s.reliability)}</span>, value: (s) => s.reliability },
    { key: "veh", header: "Auto fornite", cell: (s) => s.stats?.vehicles ?? 0, value: (s) => s.stats?.vehicles ?? 0, className: "text-right" },
    { key: "stock", header: "In stock", cell: (s) => s.stats?.in_stock ?? 0, value: (s) => s.stats?.in_stock ?? 0, className: "text-right" },
    { key: "sold", header: "Vendute", cell: (s) => s.stats?.sold ?? 0, value: (s) => s.stats?.sold ?? 0, className: "text-right" },
    { key: "days", header: "Giorni medi alla vendita", cell: (s) => s.stats?.avg_days_to_sell ?? "—", value: (s) => s.stats?.avg_days_to_sell, className: "text-right" },
    { key: "margin", header: "Margine medio", cell: (s) => s.stats?.avg_margin != null ? <b className="text-primary">{fmtEur(s.stats.avg_margin)}</b> : "—", value: (s) => s.stats?.avg_margin, className: "text-right" },
  ];
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h1 className="text-2xl">Fornitori</h1><p className="text-sm text-muted-foreground">Da chi compriamo e come rendono le loro auto</p></div>
        {canWrite && <Link to="/fornitori/nuovo" className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground shadow-glow">+ Nuovo fornitore</Link>}
      </div>
      {q.error && <p className="card p-4 text-sm text-destructive-ink">{(q.error as Error).message}</p>}
      <DataTable
        rows={q.data ?? []} columns={columns} rowKey={(s) => s.id} loading={q.isLoading}
        searchText={(s) => [s.name, s.vat_number, SUPPLIER_TYPE[s.type], s.contacts?.person].join(" ")}
        searchPlaceholder="Cerca nome, partita IVA"
        filters={Object.entries(SUPPLIER_TYPE).map(([k, l]) => ({ key: k, label: l, test: (s: Row) => s.type === k }))}
        initialSort={{ key: "name", dir: "asc" }}
        onRowClick={(s) => nav(`/fornitori/${s.id}`)}
        mobileRow={(s) => (
          <Link to={`/fornitori/${s.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted">
            <div className="min-w-0 flex-1"><div className="truncate font-bold">{s.name}</div><div className="truncate text-xs text-muted-foreground">{SUPPLIER_TYPE[s.type]} · {s.stats?.vehicles ?? 0} auto · margine medio {s.stats?.avg_margin != null ? fmtEur(s.stats.avg_margin) : "—"}</div></div>
            <span className="text-xs tracking-wider text-warning-ink">{stars(s.reliability)}</span>
          </Link>
        )}
        exportName="fornitori"
      />
    </>
  );
}

const EMPTY = { name: "", type: "dealer", vat_number: "", payment_terms: "", reliability: "3", notes: "", person: "", phone: "", email: "" };

/** Scheda fornitore: dati, valutazione, statistiche e auto fornite. Con id = "nuovo" crea. */
export function SupplierDetailPage() {
  const { id } = useParams();
  const isNew = id === "nuovo";
  const nav = useNavigate();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const canWrite = profile?.role === "admin" || profile?.role === "used_manager";
  const [f, setF] = useState(EMPTY);
  const set = (k: keyof typeof EMPTY, v: string) => setF((x) => ({ ...x, [k]: v }));

  const q = useQuery({
    queryKey: ["supplier", id],
    enabled: !isNew,
    queryFn: async () => {
      const [s, st, v] = await Promise.all([
        supabase.from("supplier").select("*").eq("id", id!).single(),
        supabase.from("supplier_stats").select("*").eq("supplier_id", id!).maybeSingle(),
        supabase.from("vehicle_public").select("id,plate,make,model,status,days_in_stock,sale_price,list_price").eq("supplier_id", id!).order("created_at", { ascending: false }),
      ]);
      if (s.error) throw s.error;
      return { supplier: s.data as Supplier, stats: st.data as Stats | null, vehicles: v.data ?? [] };
    },
  });
  useEffect(() => {
    const s = q.data?.supplier;
    if (s) setF({ name: s.name, type: s.type, vat_number: s.vat_number ?? "", payment_terms: s.payment_terms ?? "", reliability: String(s.reliability ?? ""), notes: s.notes ?? "", person: s.contacts?.person ?? "", phone: s.contacts?.phone ?? "", email: s.contacts?.email ?? "" });
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("Profilo mancante");
      if (!f.name.trim()) throw new Error("Il nome è obbligatorio");
      const row = {
        name: f.name.trim(), type: f.type, vat_number: f.vat_number.trim() || null, payment_terms: f.payment_terms.trim() || null,
        reliability: f.reliability ? Number(f.reliability) : null, notes: f.notes.trim() || null,
        contacts: { person: f.person.trim() || undefined, phone: f.phone.trim() || undefined, email: f.email.trim() || undefined },
      };
      if (isNew) {
        const { data, error } = await supabase.from("supplier").insert({ ...row, dealership_id: profile.dealership_id }).select("id").single();
        if (error) throw error;
        return data.id as string;
      }
      const { error } = await supabase.from("supplier").update(row).eq("id", id!);
      if (error) throw error;
      return id!;
    },
    onSuccess: (sid) => { toast.success("Fornitore salvato"); qc.invalidateQueries({ queryKey: ["suppliers"] }); qc.invalidateQueries({ queryKey: ["supplier"] }); if (isNew) nav(`/fornitori/${sid}`, { replace: true }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isNew && q.isLoading) return <p className="text-sm text-muted-foreground">Carico…</p>;
  if (!isNew && (q.error || !q.data)) return <p className="card p-4 text-sm text-destructive-ink">Fornitore non trovato o non visibile con il tuo ruolo.</p>;
  const st = q.data?.stats;
  const field = (k: keyof typeof EMPTY, label: string, props: Record<string, unknown> = {}) => (
    <div><Label htmlFor={k}>{label}</Label><Input id={k} value={f[k]} onChange={(e) => set(k, e.target.value)} disabled={!canWrite} {...props} /></div>
  );
  function submit(e: FormEvent) { e.preventDefault(); save.mutate(); }

  return (
    <>
      <Link to="/fornitori" className="text-sm font-bold text-primary">‹ Fornitori</Link>
      <h1 className="text-2xl">{isNew ? "Nuovo fornitore" : f.name}</h1>
      {!isNew && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Auto fornite" value={String(st?.vehicles ?? 0)} sub={`${st?.in_stock ?? 0} in stock`} />
          <Kpi label="Vendute" value={String(st?.sold ?? 0)} />
          <Kpi label="Giorni medi alla vendita" value={st?.avg_days_to_sell != null ? String(st.avg_days_to_sell) : "—"} />
          <Kpi label="Margine medio" value={st?.avg_margin != null ? fmtEur(st.avg_margin) : "—"} accent />
        </div>
      )}
      <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        <section className="card space-y-3 p-4">
          <h3 className="text-base">Dati</h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">{field("name", "Nome", { required: true })}</div>
            <div><Label htmlFor="type">Tipo</Label><select id="type" disabled={!canWrite} className="h-11 w-full rounded-xl border border-input bg-card px-3 text-sm" value={f.type} onChange={(e) => set("type", e.target.value)}>{Object.entries(SUPPLIER_TYPE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            <div><Label htmlFor="rel">Affidabilità</Label><select id="rel" disabled={!canWrite} className="h-11 w-full rounded-xl border border-input bg-card px-3 text-sm" value={f.reliability} onChange={(e) => set("reliability", e.target.value)}><option value="">—</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{stars(n)}</option>)}</select></div>
            {field("vat_number", "Partita IVA")}{field("payment_terms", "Termini di pagamento", { placeholder: "es. 30 gg" })}
          </div>
        </section>
        <section className="card space-y-3 p-4">
          <h3 className="text-base">Contatti</h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">{field("person", "Referente")}</div>
            {field("phone", "Telefono", { type: "tel" })}{field("email", "E-mail", { type: "email" })}
            <div className="col-span-2">{field("notes", "Note")}</div>
          </div>
          {canWrite && <Button type="submit" className="w-full" disabled={save.isPending}>{save.isPending ? "Salvo…" : isNew ? "Crea fornitore" : "Salva"}</Button>}
        </section>
      </form>
      {!isNew && q.data && (
        <section className="card overflow-hidden">
          <div className="px-4 pb-2 pt-4"><h3 className="text-base">Auto fornite</h3></div>
          {q.data.vehicles.map((v) => {
            const [l, t] = VSTATUS[v.status] ?? [v.status, "muted" as Tone];
            return (
              <Link key={v.id} to={`/auto/${v.id}`} className="flex items-center gap-3 border-t border-border px-4 py-2.5 text-sm hover:bg-muted">
                <span className="min-w-0 flex-1 truncate"><b>{v.plate}</b> · {v.make} {v.model} · {v.days_in_stock ?? 0} gg · {fmtEur(v.sale_price ?? v.list_price)}</span>
                <Pill tone={t}>{l}</Pill>
              </Link>
            );
          })}
          {q.data.vehicles.length === 0 && <p className="px-4 pb-4 text-sm text-muted-foreground">Nessuna auto.</p>}
        </section>
      )}
    </>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return <div className="card p-3.5"><div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</div><div className={`mt-0.5 font-display text-xl font-extrabold tabular-nums ${accent ? "text-primary" : ""}`}>{value}</div>{sub && <div className="text-xs text-muted-foreground">{sub}</div>}</div>;
}
