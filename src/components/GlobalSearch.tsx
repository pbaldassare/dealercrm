import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Car, Search, User, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface Hit { kind: "vehicle" | "customer" | "lead"; id: string; title: string; sub: string; to: string }

const CUSTOMER_ROLES = ["admin", "owner", "sales_manager", "salesperson", "used_manager", "accounting", "finance_insurance"];
const LEAD_ROLES = ["admin", "owner", "sales_manager", "salesperson", "used_manager", "accounting", "finance_insurance", "marketing"];

/** Ricerca unica per targa, modello, cliente (nome o telefono) e riferimento lead. Ognuno vede solo quello che la RLS gli lascia. */
export function GlobalSearch({ autoFocus, onDone, className }: { autoFocus?: boolean; onDone?: () => void; className?: string }) {
  const nav = useNavigate();
  const { profile } = useAuth();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits([]); return; }
    const t = setTimeout(async () => {
      const like = `%${term.replace(/[%_,()]/g, "")}%`;
      const plate = term.replace(/\s/g, "").toUpperCase();
      const role = profile?.role ?? "";
      const [v, c, l] = await Promise.all([
        supabase.from("vehicle_public").select("id,plate,make,model,status").or(`plate.ilike.%${plate}%,make.ilike.${like},model.ilike.${like}`).limit(6),
        CUSTOMER_ROLES.includes(role) ? supabase.from("customer").select("id,first_name,last_name,phone,city").or(`last_name.ilike.${like},first_name.ilike.${like},phone.ilike.${like},email.ilike.${like}`).limit(6) : { data: [] },
        LEAD_ROLES.includes(role) ? supabase.from("lead").select("id,source_ref,interest_text,status").ilike("source_ref", like).limit(4) : { data: [] },
      ]);
      setHits([
        ...(v.data ?? []).map((x) => ({ kind: "vehicle" as const, id: x.id, title: `${x.plate} · ${x.make} ${x.model}`, sub: "Auto", to: `/auto/${x.id}` })),
        ...(c.data ?? []).map((x) => ({ kind: "customer" as const, id: x.id, title: `${x.first_name} ${x.last_name}`.trim(), sub: [x.phone, x.city].filter(Boolean).join(" · ") || "Cliente", to: `/clienti/${x.id}` })),
        ...(l.data ?? []).map((x) => ({ kind: "lead" as const, id: x.id, title: x.source_ref ?? "Lead", sub: x.interest_text ?? "Lead", to: `/lead/${x.id}` })),
      ]);
      setActive(0);
      setOpen(true);
    }, 250);
    return () => clearTimeout(t);
  }, [q, profile?.role]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const go = (h: Hit) => { nav(h.to); setQ(""); setOpen(false); onDone?.(); };
  const Icon = { vehicle: Car, customer: User, lead: Users };

  return (
    <div ref={box} className={cn("relative", className)}>
      <label className="flex items-center gap-2 rounded-full border border-input bg-card px-4 py-1.5">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          value={q} autoFocus={autoFocus} placeholder="Cerca targa, cliente, lead…" aria-label="Cerca"
          onChange={(e) => setQ(e.target.value)} onFocus={() => hits.length && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            if (e.key === "Enter" && hits[active]) go(hits[active]);
            if (e.key === "Escape") { setOpen(false); onDone?.(); }
          }}
          className="h-8 min-w-0 flex-1 bg-transparent outline-none"
        />
      </label>
      {open && q.trim().length >= 2 && (
        <div className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-border bg-card shadow-card">
          {hits.map((h, i) => {
            const I = Icon[h.kind];
            return (
              <button key={`${h.kind}-${h.id}`} onMouseEnter={() => setActive(i)} onClick={() => go(h)}
                className={cn("flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm", i === active && "bg-muted")}>
                <I className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1"><span className="block truncate font-bold">{h.title}</span><span className="block truncate text-xs text-muted-foreground">{h.sub}</span></span>
              </button>
            );
          })}
          {hits.length === 0 && <p className="px-4 py-3 text-sm text-muted-foreground">Nessun risultato.</p>}
        </div>
      )}
    </div>
  );
}
