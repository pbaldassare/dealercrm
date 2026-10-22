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
import { fmtDate, fmtEur } from "@/lib/utils";
import { CHANNEL, LEAD_STATUS, statusTone } from "@/features/leads/LeadRow";
import { DEAL_STATUS } from "@/features/deals/DealsPage";

interface Customer {
  id: string; first_name: string; last_name: string; phone: string | null; email: string | null; city: string | null; created_at: string;
  privacy_consent: boolean; marketing_consent: boolean; is_demo: boolean;
  tax_code: string | null; vat_number: string | null; birth_date: string | null; birth_place: string | null; id_document: string | null;
  address_street: string | null; address_postal_code: string | null; address_province: string | null; ei_code: string | null; certified_email: string | null; notes: string | null;
}
const WRITE_ROLES = ["admin", "sales_manager", "salesperson", "accounting", "finance_insurance"];
const normPhone = (s: string) => { const p = s.replace(/[^\d+]/g, ""); return !p ? null : p.startsWith("+") ? p : p.startsWith("00") ? "+" + p.slice(2) : "+39" + p; };

/** Anagrafica clienti: elenco con ricerca, numero di lead e pratiche, export. */
export function CustomersPage() {
  const nav = useNavigate();
  const { profile } = useAuth();
  const canWrite = !!profile && WRITE_ROLES.includes(profile.role);
  const q = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const [c, l, d] = await Promise.all([
        supabase.from("customer").select("*").order("last_name").limit(5000),
        supabase.from("lead").select("customer_id,status").limit(10000),
        supabase.from("deal").select("customer_id,status"),
      ]);
      if (c.error) throw c.error;
      const leads = new Map<string, number>(), open = new Map<string, number>(), deals = new Map<string, number>();
      (l.data ?? []).forEach((x) => { leads.set(x.customer_id, (leads.get(x.customer_id) ?? 0) + 1); if (!["won", "lost", "invalid"].includes(x.status)) open.set(x.customer_id, (open.get(x.customer_id) ?? 0) + 1); });
      (d.data ?? []).forEach((x) => deals.set(x.customer_id, (deals.get(x.customer_id) ?? 0) + 1));
      return (c.data as Customer[]).map((x) => ({ ...x, leads: leads.get(x.id) ?? 0, open: open.get(x.id) ?? 0, deals: deals.get(x.id) ?? 0 }));
    },
  });
  type Row = NonNullable<typeof q.data>[number];
  const columns: Column<Row>[] = [
    { key: "name", header: "Cliente", cell: (c) => <b>{c.last_name} {c.first_name}</b>, value: (c) => `${c.last_name} ${c.first_name}` },
    { key: "phone", header: "Telefono", cell: (c) => c.phone ?? "—", value: (c) => c.phone },
    { key: "email", header: "E-mail", cell: (c) => c.email ?? "—", value: (c) => c.email },
    { key: "city", header: "Città", cell: (c) => c.city ?? "—", value: (c) => c.city },
    { key: "leads", header: "Lead", cell: (c) => <span>{c.leads}{c.open ? <span className="text-primary"> ({c.open} aperte)</span> : ""}</span>, value: (c) => c.leads, className: "text-right" },
    { key: "deals", header: "Pratiche", cell: (c) => c.deals || "—", value: (c) => c.deals, className: "text-right" },
    { key: "fiscal", header: "Dati fiscali", cell: (c) => c.tax_code || c.vat_number ? <Pill tone="ok">completi</Pill> : <Pill>mancano</Pill>, value: (c) => (c.tax_code || c.vat_number ? 1 : 0) },
    { key: "created", header: "Dal", cell: (c) => fmtDate(c.created_at), value: (c) => c.created_at },
  ];
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h1 className="text-2xl">Clienti</h1><p className="text-sm text-muted-foreground">Anagrafica unica di lead e pratiche</p></div>
        {canWrite && <Link to="/clienti/nuovo" className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground shadow-glow">+ Nuovo cliente</Link>}
      </div>
      {q.error && <p className="card p-4 text-sm text-destructive-ink">{(q.error as Error).message}</p>}
      <DataTable
        rows={q.data ?? []} columns={columns} rowKey={(c) => c.id} loading={q.isLoading}
        searchText={(c) => [c.first_name, c.last_name, c.phone, c.email, c.city, c.tax_code, c.vat_number].join(" ")}
        searchPlaceholder="Cerca nome, telefono, e-mail, codice fiscale"
        filters={[
          { key: "open", label: "Con lead aperte", test: (c) => c.open > 0 },
          { key: "deals", label: "Con pratiche", test: (c) => c.deals > 0 },
          { key: "nofiscal", label: "Senza dati fiscali", test: (c) => !c.tax_code && !c.vat_number },
          { key: "marketing", label: "Consenso marketing", test: (c) => c.marketing_consent },
        ]}
        initialSort={{ key: "name", dir: "asc" }}
        onRowClick={(c) => nav(`/clienti/${c.id}`)}
        mobileRow={(c) => (
          <Link to={`/clienti/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted">
            <div className="min-w-0 flex-1"><div className="truncate font-bold">{c.last_name} {c.first_name}</div><div className="truncate text-xs text-muted-foreground">{[c.phone, c.city].filter(Boolean).join(" · ") || "—"}</div></div>
            <span className="text-xs text-muted-foreground">{c.leads} lead · {c.deals} pratiche</span>
          </Link>
        )}
        exportName="clienti"
      />
    </>
  );
}

const EMPTY = {
  first_name: "", last_name: "", phone: "", email: "", city: "", tax_code: "", vat_number: "", birth_date: "", birth_place: "", id_document: "",
  address_street: "", address_postal_code: "", address_province: "", ei_code: "", certified_email: "", notes: "", privacy_consent: false, marketing_consent: false,
};
type Form = typeof EMPTY;

/** Scheda cliente: anagrafica e dati fiscali (servono a contratto e fattura), lead e pratiche collegate. Con id = "nuovo" crea. */
export function CustomerDetailPage() {
  const { id } = useParams();
  const isNew = id === "nuovo";
  const nav = useNavigate();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const canWrite = !!profile && WRITE_ROLES.includes(profile.role);
  const [f, setF] = useState<Form>(EMPTY);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  const q = useQuery({
    queryKey: ["customer", id],
    enabled: !isNew,
    queryFn: async () => {
      const { data, error } = await supabase.from("customer").select("*").eq("id", id!).single();
      if (error) throw error;
      const [l, d] = await Promise.all([
        supabase.from("lead").select("id,source_ref,channel,status,created_at,assignee:assigned_to(full_name)").eq("customer_id", id!).order("created_at", { ascending: false }),
        supabase.from("deal").select("id,status,sale_price,created_at,vehicle_id").eq("customer_id", id!).order("created_at", { ascending: false }),
      ]);
      const vIds = (d.data ?? []).map((x) => x.vehicle_id);
      const { data: v } = vIds.length ? await supabase.from("vehicle_public").select("id,plate,make,model").in("id", vIds) : { data: [] };
      const vm = new Map((v ?? []).map((x) => [x.id, x]));
      return {
        customer: data as Customer,
        leads: (l.data ?? []) as unknown as Array<{ id: string; source_ref: string | null; channel: string; status: string; created_at: string; assignee: { full_name: string } | null }>,
        deals: (d.data ?? []).map((x) => ({ ...x, vehicle: vm.get(x.vehicle_id) })),
      };
    },
  });
  useEffect(() => {
    const c = q.data?.customer;
    if (c) setF(Object.fromEntries(Object.entries(EMPTY).map(([k, def]) => [k, typeof def === "boolean" ? Boolean(c[k as keyof Customer]) : (c[k as keyof Customer] ?? "") as string])) as Form);
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("Profilo mancante");
      if (!f.last_name.trim()) throw new Error("Il cognome è obbligatorio");
      const t = (s: string) => s.trim() || null;
      const row = {
        first_name: f.first_name.trim(), last_name: f.last_name.trim(), phone: normPhone(f.phone), email: t(f.email)?.toLowerCase() ?? null, city: t(f.city),
        tax_code: t(f.tax_code)?.toUpperCase() ?? null, vat_number: t(f.vat_number), birth_date: f.birth_date || null, birth_place: t(f.birth_place), id_document: t(f.id_document),
        address_street: t(f.address_street), address_postal_code: t(f.address_postal_code), address_province: t(f.address_province)?.toUpperCase() ?? null,
        ei_code: t(f.ei_code)?.toUpperCase() ?? null, certified_email: t(f.certified_email), notes: t(f.notes), privacy_consent: f.privacy_consent, marketing_consent: f.marketing_consent,
      };
      if (isNew) {
        const { data, error } = await supabase.from("customer").insert({ ...row, dealership_id: profile.dealership_id }).select("id").single();
        if (error) throw error.message.includes("duplicate") ? new Error("Esiste già un cliente con questo telefono o e-mail") : error;
        return data.id as string;
      }
      const { error } = await supabase.from("customer").update(row).eq("id", id!);
      if (error) throw error.message.includes("duplicate") ? new Error("Esiste già un cliente con questo telefono o e-mail") : error;
      return id!;
    },
    onSuccess: (cid) => { toast.success("Cliente salvato"); qc.invalidateQueries({ queryKey: ["customers"] }); qc.invalidateQueries({ queryKey: ["customer"] }); if (isNew) nav(`/clienti/${cid}`, { replace: true }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isNew && q.isLoading) return <p className="text-sm text-muted-foreground">Carico…</p>;
  if (!isNew && (q.error || !q.data)) return <p className="card p-4 text-sm text-destructive-ink">Cliente non trovato o non visibile con il tuo ruolo.</p>;
  const field = (k: keyof Form, label: string, props: Record<string, unknown> = {}) => (
    <div><Label htmlFor={k}>{label}</Label><Input id={k} value={f[k] as string} onChange={(e) => set(k, e.target.value as never)} disabled={!canWrite} {...props} /></div>
  );
  function submit(e: FormEvent) { e.preventDefault(); save.mutate(); }

  return (
    <>
      <Link to="/clienti" className="text-sm font-bold text-primary">‹ Clienti</Link>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h1 className="text-2xl">{isNew ? "Nuovo cliente" : `${f.first_name} ${f.last_name}`}</h1>
        {!isNew && f.phone && <div className="flex gap-2"><a href={`tel:${f.phone}`}><Button size="sm">Chiama</Button></a><a href={`https://wa.me/${f.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"><Button size="sm" variant="outline">WhatsApp</Button></a></div>}
      </div>
      <form onSubmit={submit} className="grid gap-4 lg:grid-cols-3">
        <section className="card space-y-3 p-4">
          <h3 className="text-base">Contatti</h3>
          <div className="grid grid-cols-2 gap-2">
            {field("first_name", "Nome")}{field("last_name", "Cognome", { required: true })}
            {field("phone", "Telefono", { type: "tel" })}{field("email", "E-mail", { type: "email" })}
            <div className="col-span-2">{field("city", "Città")}</div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.privacy_consent} disabled={!canWrite} onChange={(e) => set("privacy_consent", e.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" />Informativa privacy accettata</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.marketing_consent} disabled={!canWrite} onChange={(e) => set("marketing_consent", e.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" />Consenso a contatti commerciali</label>
        </section>
        <section className="card space-y-3 p-4">
          <h3 className="text-base">Anagrafica per il contratto</h3>
          <div className="grid grid-cols-2 gap-2">
            {field("birth_date", "Data di nascita", { type: "date" })}{field("birth_place", "Luogo di nascita")}
            <div className="col-span-2">{field("id_document", "Documento d'identità", { placeholder: "tipo e numero" })}</div>
            <div className="col-span-2">{field("address_street", "Indirizzo")}</div>
            {field("address_postal_code", "CAP", { inputMode: "numeric" })}{field("address_province", "Provincia", { maxLength: 2, className: "uppercase" })}
          </div>
        </section>
        <section className="card space-y-3 p-4">
          <h3 className="text-base">Dati fiscali per la fattura</h3>
          <div className="grid grid-cols-2 gap-2">
            {field("tax_code", "Codice fiscale", { className: "uppercase" })}{field("vat_number", "Partita IVA")}
            {field("ei_code", "Codice destinatario", { maxLength: 7, className: "uppercase" })}{field("certified_email", "PEC", { type: "email" })}
            <div className="col-span-2">{field("notes", "Note")}</div>
          </div>
          {canWrite && <Button type="submit" className="w-full" disabled={save.isPending}>{save.isPending ? "Salvo…" : isNew ? "Crea cliente" : "Salva"}</Button>}
        </section>
      </form>

      {!isNew && q.data && (
        <div className="grid gap-4 md:grid-cols-2">
          <section className="card p-4"><h3 className="text-base">Lead</h3>
            <ul className="mt-2 text-sm">
              {q.data.leads.map((l) => (
                <li key={l.id} className="border-t border-border py-2 first:border-t-0">
                  <Link to={`/lead/${l.id}`} className="flex items-center justify-between gap-2 hover:text-primary">
                    <span><b>{l.source_ref ?? "Lead"}</b> · {CHANNEL[l.channel] ?? l.channel} · {fmtDate(l.created_at)}{l.assignee ? ` · ${l.assignee.full_name}` : ""}</span>
                    <Pill tone={statusTone(l.status)}>{LEAD_STATUS[l.status] ?? l.status}</Pill>
                  </Link>
                </li>
              ))}
              {q.data.leads.length === 0 && <li className="text-muted-foreground">Nessuna lead.</li>}
            </ul>
          </section>
          <section className="card p-4"><h3 className="text-base">Pratiche</h3>
            <ul className="mt-2 text-sm">
              {q.data.deals.map((d) => {
                const [l, t] = DEAL_STATUS[d.status] ?? [d.status, "muted" as Tone];
                return (
                  <li key={d.id} className="border-t border-border py-2 first:border-t-0">
                    <Link to={`/pratiche/${d.id}`} className="flex items-center justify-between gap-2 hover:text-primary">
                      <span><b>{d.vehicle ? `${d.vehicle.plate} · ${d.vehicle.make} ${d.vehicle.model}` : "Auto"}</b> · {fmtEur(d.sale_price)} · {fmtDate(d.created_at)}</span>
                      <Pill tone={t}>{l}</Pill>
                    </Link>
                  </li>
                );
              })}
              {q.data.deals.length === 0 && <li className="text-muted-foreground">Nessuna pratica.</li>}
            </ul>
            <Link to={`/pratiche/nuova`} className="mt-3 inline-block text-sm font-bold text-primary">+ Nuova pratica</Link>
          </section>
        </div>
      )}
    </>
  );
}
