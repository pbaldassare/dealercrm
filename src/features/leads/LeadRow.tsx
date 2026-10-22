import { Link } from "react-router-dom";
import { Pill, type Tone } from "@/components/ui/pill";
import { timeLeft } from "@/lib/utils";

export interface LeadOpen {
  id: string;
  source_ref: string | null;
  channel: string;
  status: string;
  status_changed_at: string;
  status_deadline_at: string | null;
  temperature: "hot" | "warm" | "cold" | "invalid" | null;
  ai_score: number | null;
  price_band: string | null;
  assigned_to: string | null;
  interest_text: string | null;
  vehicle_id: string | null;
  remaining_seconds: number | null;
}

export const LEAD_STATUS: Record<string, string> = {
  new: "Nuova", ai_qualifying: "IA in corso", qualified: "Qualificata", assigned: "Assegnata", contacted: "Contattata",
  appointment_set: "Appuntamento", visited: "Visita fatta", proposal_sent: "Proposta inviata", negotiating: "In trattativa",
  won: "Vinta", lost: "Persa", invalid: "Non valida",
};
export const CHANNEL: Record<string, string> = {
  autoscout24: "AutoScout24", other_portal: "Altro portale", website: "Sito", whatsapp: "WhatsApp", voicemail: "Voicemail",
  phone: "Telefono", facebook: "Facebook", instagram: "Instagram", walk_in: "In sede",
};

export function statusTone(s: string): Tone {
  if (s === "won") return "ok";
  if (s === "lost" || s === "invalid") return "bad";
  if (s === "new" || s === "ai_qualifying") return "muted";
  return "primary";
}

export function LeadRow({ lead }: { lead: LeadOpen }) {
  const t = timeLeft(lead.status_deadline_at);
  const total = lead.status_deadline_at ? new Date(lead.status_deadline_at).getTime() - new Date(lead.status_changed_at).getTime() : 0;
  const ratio = t && total > 0 ? t.pct / total : 1;
  const color = !t ? "" : t.late ? "text-destructive-ink" : ratio < 0.25 ? "text-warning-ink" : "text-success-ink";
  return (
    <Link to={`/lead/${lead.id}`} className="flex w-full items-center gap-3 border-t border-border px-4 py-3 text-left first:border-t-0 hover:bg-muted">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 font-display text-base font-extrabold text-primary">{lead.price_band ?? "?"}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-bold">{lead.source_ref ?? "Lead"} · {lead.interest_text ?? "Richiesta"}</div>
        <div className="truncate text-xs text-muted-foreground">{CHANNEL[lead.channel] ?? lead.channel} · {LEAD_STATUS[lead.status] ?? lead.status}</div>
      </div>
      {lead.temperature && lead.temperature !== "invalid" && (
        <Pill tone={lead.temperature === "hot" ? "hot" : lead.temperature === "warm" ? "warn" : "info"} className="hidden sm:inline-flex">
          {lead.temperature === "hot" ? "Calda" : lead.temperature === "warm" ? "Tiepida" : "Fredda"}
        </Pill>
      )}
      {t && (
        <div className={`min-w-[60px] text-right font-display text-sm font-extrabold tabular-nums ${color}`}>
          {t.late ? "−" : ""}{t.text}
          <div className="font-sans text-[10px] font-semibold text-muted-foreground">{t.late ? "scaduto" : "residuo"}</div>
        </div>
      )}
    </Link>
  );
}
