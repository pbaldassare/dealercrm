import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { WORD } from "./VehiclesPage";
import { parseNum } from "@/lib/utils";

const sel = "h-11 w-full rounded-xl border border-input bg-card px-3 text-sm";
const EMPTY = {
  plate: "", vin: "", make: "", model: "", trim: "", kind: "used", body_type: "", first_registration: "", mileage_km: "", fuel_type: "",
  gearbox: "", power_kw: "", color: "", emission_class: "", previous_owners: "", supplier_id: "", purchase_cost: "", list_price: "",
  sale_price: "", entry_date: new Date().toISOString().slice(0, 10), expected_arrival: "", notes: "", status: "received",
};
type Form = typeof EMPTY;
const num = parseNum;
const opts = (keys: string[]) => keys.map((k) => <option key={k} value={k}>{WORD[k] ?? k}</option>);

/** Nuova auto o modifica (usato e admin). Lo stato iniziale si sceglie qui; dopo cambia solo dalla scheda (change_vehicle_status). */
export function VehicleFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const nav = useNavigate();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [f, setF] = useState<Form>(EMPTY);
  const set = (k: keyof Form, v: string) => setF((x) => ({ ...x, [k]: v }));

  const refs = useQuery({
    queryKey: ["vehicle-form", id],
    queryFn: async () => {
      const [s, v] = await Promise.all([
        supabase.from("supplier").select("id,name").order("name"),
        id ? supabase.from("vehicle").select("*").eq("id", id).single() : { data: null, error: null },
      ]);
      if (v.error) throw v.error;
      return { suppliers: s.data ?? [], vehicle: v.data as Record<string, unknown> | null };
    },
  });
  useEffect(() => {
    const v = refs.data?.vehicle;
    if (!v) return;
    setF(Object.fromEntries(Object.keys(EMPTY).map((k) => [k, v[k] == null ? "" : String(v[k])])) as Form);
  }, [refs.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("Profilo mancante");
      const plate = f.plate.replace(/\s/g, "").toUpperCase();
      if (!/^[A-Z]{2}[0-9]{3}[A-Z]{2}$/.test(plate)) throw new Error("Targa non valida (formato AA999AA)");
      if (!f.make.trim() || !f.model.trim()) throw new Error("Marca e modello sono obbligatori");
      const row = {
        plate, vin: f.vin.trim() || null, make: f.make.trim(), model: f.model.trim(), trim: f.trim.trim() || null, kind: f.kind,
        body_type: f.body_type || null, first_registration: f.first_registration || null, mileage_km: num(f.mileage_km), fuel_type: f.fuel_type || null,
        gearbox: f.gearbox || null, power_kw: num(f.power_kw), color: f.color.trim() || null, emission_class: f.emission_class.trim() || null,
        previous_owners: num(f.previous_owners), supplier_id: f.supplier_id || null, purchase_cost: num(f.purchase_cost), list_price: num(f.list_price),
        sale_price: num(f.sale_price), entry_date: f.entry_date || null, expected_arrival: f.expected_arrival || null, notes: f.notes.trim() || null,
      };
      if (editing) {
        const { error } = await supabase.from("vehicle").update(row).eq("id", id!);
        if (error) throw error;
        return id!;
      }
      const { data, error } = await supabase.from("vehicle").insert({ ...row, dealership_id: profile.dealership_id, status: f.status }).select("id").single();
      if (error) throw error.message.includes("duplicate") ? new Error(`La targa ${plate} è già in stock`) : error;
      return data.id as string;
    },
    onSuccess: (vid) => { toast.success(editing ? "Auto aggiornata" : "Auto inserita"); qc.invalidateQueries({ queryKey: ["vehicle_public"] }); qc.invalidateQueries({ queryKey: ["vehicle"] }); nav(`/auto/${vid}`); },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit(e: FormEvent) { e.preventDefault(); save.mutate(); }
  const field = (k: keyof Form, label: string, props: Record<string, unknown> = {}) => (
    <div><Label htmlFor={k}>{label}</Label><Input id={k} value={f[k]} onChange={(e) => set(k, e.target.value)} {...props} /></div>
  );

  if (refs.error) return <p className="card p-4 text-sm text-destructive-ink">{(refs.error as Error).message}</p>;
  return (
    <>
      <Link to={editing ? `/auto/${id}` : "/auto"} className="text-sm font-bold text-primary">‹ {editing ? "Scheda" : "Auto"}</Link>
      <h1 className="text-2xl">{editing ? `Modifica ${f.plate}` : "Nuova auto"}</h1>
      <form onSubmit={submit} className="grid gap-4 lg:grid-cols-3">
        <section className="card space-y-3 p-4">
          <h3 className="text-base">Identificazione</h3>
          <div className="grid grid-cols-2 gap-2">
            {field("plate", "Targa", { required: true, className: "uppercase tracking-wider", placeholder: "AA123BB" })}
            {field("vin", "Telaio", { className: "uppercase" })}
            {field("make", "Marca", { required: true })}
            {field("model", "Modello", { required: true })}
            <div className="col-span-2">{field("trim", "Allestimento")}</div>
            <div><Label htmlFor="kind">Tipo</Label><select id="kind" className={sel} value={f.kind} onChange={(e) => set("kind", e.target.value)}>{opts(["used", "km0", "new"])}</select></div>
            <div><Label htmlFor="body">Carrozzeria</Label><select id="body" className={sel} value={f.body_type} onChange={(e) => set("body_type", e.target.value)}><option value="">—</option>{opts(["city_car", "sedan", "station_wagon", "suv", "minivan", "coupe", "other"])}</select></div>
          </div>
        </section>
        <section className="card space-y-3 p-4">
          <h3 className="text-base">Caratteristiche</h3>
          <div className="grid grid-cols-2 gap-2">
            {field("first_registration", "Immatricolazione", { type: "date" })}
            {field("mileage_km", "Km", { inputMode: "numeric" })}
            <div><Label htmlFor="fuel">Alimentazione</Label><select id="fuel" className={sel} value={f.fuel_type} onChange={(e) => set("fuel_type", e.target.value)}><option value="">—</option>{opts(["petrol", "diesel", "hybrid", "electric", "lpg", "methane"])}</select></div>
            <div><Label htmlFor="gear">Cambio</Label><select id="gear" className={sel} value={f.gearbox} onChange={(e) => set("gearbox", e.target.value)}><option value="">—</option>{opts(["manual", "automatic"])}</select></div>
            {field("power_kw", "Potenza (kW)", { inputMode: "numeric" })}
            {field("color", "Colore")}
            {field("emission_class", "Classe emissioni", { placeholder: "Euro 6" })}
            {field("previous_owners", "Proprietari precedenti", { inputMode: "numeric" })}
          </div>
        </section>
        <section className="card space-y-3 p-4">
          <h3 className="text-base">Acquisto e prezzo</h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2"><Label htmlFor="sup">Fornitore</Label><select id="sup" className={sel} value={f.supplier_id} onChange={(e) => set("supplier_id", e.target.value)}><option value="">—</option>{refs.data?.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            {field("purchase_cost", "Costo acquisto", { inputMode: "decimal", placeholder: "€" })}
            {field("entry_date", "Data ingresso", { type: "date" })}
            {field("list_price", "Prezzo listino", { inputMode: "decimal", placeholder: "€" })}
            {field("sale_price", "Prezzo vendita", { inputMode: "decimal", placeholder: "€" })}
            {!editing && <div><Label htmlFor="st">Stato iniziale</Label><select id="st" className={sel} value={f.status} onChange={(e) => set("status", e.target.value)}><option value="incoming">In arrivo</option><option value="received">Ricevuta</option></select></div>}
            {(f.status === "incoming" || f.expected_arrival) && field("expected_arrival", "Arrivo previsto", { type: "date" })}
            <div className="col-span-2">{field("notes", "Note")}</div>
          </div>
          <Button type="submit" className="w-full" disabled={save.isPending}>{save.isPending ? "Salvo…" : editing ? "Salva modifiche" : "Inserisci auto"}</Button>
        </section>
      </form>
    </>
  );
}
