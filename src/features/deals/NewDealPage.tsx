import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { fmtEur, parseNum } from "@/lib/utils";

const sel = "h-11 w-full rounded-xl border border-input bg-card px-3 text-sm";

/** Nuova pratica: da una lead (cliente e auto già scelti) o da zero. Il trigger on_deal_created aggiunge la voce margine veicolo. */
export function NewDealPage() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { profile } = useAuth();
  const leadId = params.get("lead");

  const refs = useQuery({
    queryKey: ["new-deal-refs", leadId],
    queryFn: async () => {
      const [v, c, s, l] = await Promise.all([
        supabase.from("vehicle_public").select("id,plate,make,model,sale_price,list_price,status").in("status", ["ready", "published", "reserved"]).order("plate"),
        supabase.from("customer").select("id,first_name,last_name,phone").order("last_name").limit(300),
        supabase.from("profile").select("id,full_name").eq("role", "salesperson").eq("is_active", true).order("full_name"),
        leadId ? supabase.from("lead").select("id,customer_id,vehicle_id,assigned_to,purchase_type").eq("id", leadId).maybeSingle() : null,
      ]);
      return { vehicles: v.data ?? [], customers: c.data ?? [], sellers: s.data ?? [], lead: l?.data ?? null };
    },
  });

  const [f, setF] = useState({ vehicle_id: "", customer_id: "", salesperson_id: "", sale_price: "", deposit: "", fin_amount: "", fin_installments: "", trade_value: "", trade_plate: "", warranty: "24", conclusion: "on_premises", newCustomer: false, first_name: "", last_name: "", phone: "", email: "" });
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));

  // Precompila dalla lead
  useEffect(() => {
    const L = refs.data?.lead;
    if (!L) return;
    const veh = refs.data?.vehicles.find((x) => x.id === L.vehicle_id);
    setF((x) => ({ ...x, vehicle_id: L.vehicle_id ?? "", customer_id: L.customer_id ?? "", salesperson_id: L.assigned_to ?? (profile?.role === "salesperson" ? profile.id : ""), sale_price: veh ? String(veh.sale_price ?? veh.list_price ?? "") : "" }));
  }, [refs.data, profile]);

  const create = useMutation({
    mutationFn: async () => {
      if (!f.vehicle_id) throw new Error("Scegli l'auto");
      let customerId = f.customer_id;
      if (f.newCustomer) {
        if (!f.last_name) throw new Error("Inserisci il cognome del cliente");
        const { data: v } = await supabase.from("vehicle_public").select("dealership_id").eq("id", f.vehicle_id).single();
        const { data: c, error } = await supabase.from("customer").insert({ dealership_id: v?.dealership_id, first_name: f.first_name, last_name: f.last_name, phone: f.phone || null, email: f.email || null }).select("id").single();
        if (error) throw error;
        customerId = c.id;
      }
      if (!customerId) throw new Error("Scegli il cliente");
      const { data: v } = await supabase.from("vehicle_public").select("dealership_id").eq("id", f.vehicle_id).single();
      const num = parseNum;
      const { data, error } = await supabase.from("deal").insert({
        dealership_id: v?.dealership_id, lead_id: leadId, customer_id: customerId, vehicle_id: f.vehicle_id,
        salesperson_id: f.salesperson_id || profile?.id, status: "open", sale_price: num(f.sale_price), deposit: num(f.deposit) ?? 0,
        financing: num(f.fin_amount) ? { amount: num(f.fin_amount), installments: num(f.fin_installments) } : null,
        trade_in: num(f.trade_value) ? { value: num(f.trade_value), plate: f.trade_plate || null } : null,
        warranty_months: Number(f.warranty) || 24, conclusion_type: f.conclusion,
      }).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => { toast.success("Pratica creata"); nav(`/pratiche/${id}`); },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit(e: FormEvent) { e.preventDefault(); create.mutate(); }
  const vehicle = refs.data?.vehicles.find((x) => x.id === f.vehicle_id);

  return (
    <>
      <Link to="/pratiche" className="text-sm font-bold text-primary">‹ Pratiche</Link>
      <h1 className="text-2xl">Nuova pratica</h1>
      <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        <section className="card space-y-3 p-4">
          <h3 className="text-base">Auto e cliente</h3>
          <div><Label htmlFor="veh">Auto</Label>
            <select id="veh" className={sel} value={f.vehicle_id} onChange={(e) => { const v = refs.data?.vehicles.find((x) => x.id === e.target.value); setF((x) => ({ ...x, vehicle_id: e.target.value, sale_price: v ? String(v.sale_price ?? v.list_price ?? "") : x.sale_price })); }}>
              <option value="">Scegli…</option>{refs.data?.vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate} · {v.make} {v.model} · {fmtEur(v.sale_price ?? v.list_price)}</option>)}
            </select></div>
          {!f.newCustomer ? (
            <div><Label htmlFor="cus">Cliente</Label>
              <select id="cus" className={sel} value={f.customer_id} onChange={(e) => set("customer_id", e.target.value)}>
                <option value="">Scegli…</option>{refs.data?.customers.map((c) => <option key={c.id} value={c.id}>{c.last_name} {c.first_name}{c.phone ? ` · ${c.phone}` : ""}</option>)}
              </select>
              <button type="button" className="mt-1 text-xs font-bold text-primary" onClick={() => set("newCustomer", true)}>+ Cliente nuovo</button></div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div><Label htmlFor="fn">Nome</Label><Input id="fn" value={f.first_name} onChange={(e) => set("first_name", e.target.value)} /></div>
              <div><Label htmlFor="ln">Cognome</Label><Input id="ln" value={f.last_name} onChange={(e) => set("last_name", e.target.value)} required /></div>
              <div><Label htmlFor="ph">Telefono</Label><Input id="ph" type="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></div>
              <div><Label htmlFor="em">E-mail</Label><Input id="em" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></div>
              <button type="button" className="col-span-2 text-left text-xs font-bold text-primary" onClick={() => set("newCustomer", false)}>Scegli un cliente esistente</button>
            </div>
          )}
          <div><Label htmlFor="sp">Venditore</Label>
            <select id="sp" className={sel} value={f.salesperson_id} onChange={(e) => set("salesperson_id", e.target.value)} disabled={profile?.role === "salesperson"}>
              <option value="">{profile?.role === "salesperson" ? profile.full_name : "Scegli…"}</option>{refs.data?.sellers.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select></div>
        </section>
        <section className="card space-y-3 p-4">
          <h3 className="text-base">Condizioni</h3>
          <div className="grid grid-cols-2 gap-2">
            <div><Label htmlFor="pr">Prezzo di vendita</Label><Input id="pr" inputMode="decimal" value={f.sale_price} onChange={(e) => set("sale_price", e.target.value)} placeholder={vehicle ? String(vehicle.sale_price ?? "") : "€"} /></div>
            <div><Label htmlFor="dep">Caparra</Label><Input id="dep" inputMode="decimal" value={f.deposit} onChange={(e) => set("deposit", e.target.value)} placeholder="0" /></div>
            <div><Label htmlFor="fa">Finanziamento</Label><Input id="fa" inputMode="decimal" value={f.fin_amount} onChange={(e) => set("fin_amount", e.target.value)} placeholder="importo" /></div>
            <div><Label htmlFor="fi">Rate</Label><Input id="fi" inputMode="numeric" value={f.fin_installments} onChange={(e) => set("fin_installments", e.target.value)} placeholder="es. 60" /></div>
            <div><Label htmlFor="tv">Permuta (valore)</Label><Input id="tv" inputMode="decimal" value={f.trade_value} onChange={(e) => set("trade_value", e.target.value)} placeholder="0" /></div>
            <div><Label htmlFor="tp">Permuta (targa)</Label><Input id="tp" value={f.trade_plate} onChange={(e) => set("trade_plate", e.target.value.toUpperCase())} /></div>
            <div><Label htmlFor="wa">Garanzia (mesi)</Label><Input id="wa" inputMode="numeric" value={f.warranty} onChange={(e) => set("warranty", e.target.value)} /></div>
            <div><Label htmlFor="co">Conclusione</Label>
              <select id="co" className={sel} value={f.conclusion} onChange={(e) => set("conclusion", e.target.value)}><option value="on_premises">In sede</option><option value="distance">A distanza</option><option value="off_premises">Fuori sede</option></select></div>
          </div>
          <p className="text-xs text-muted-foreground">Con una caparra l'auto passa a "Riservata" e l'annuncio viene sospeso. La voce "Margine veicolo" si calcola da sola.</p>
          <Button type="submit" className="w-full" disabled={create.isPending}>{create.isPending ? "Creo…" : "Crea pratica"}</Button>
        </section>
      </form>
    </>
  );
}
