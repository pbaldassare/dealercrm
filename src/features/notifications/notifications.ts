import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

export interface Notification { id: string; type: string; payload: Record<string, unknown> | null; read_at: string | null; created_at: string }

/** Testo e destinazione di ogni tipo di notifica scritta dal database (timer, assegnazioni, firme). */
export function describe(n: Notification): { text: string; to: string | null } {
  const p = n.payload ?? {};
  const lead = p.lead_id ? `/lead/${p.lead_id}` : null;
  switch (n.type) {
    case "lead_assigned": return { text: "Ti è stata assegnata una lead", to: lead };
    case "lead_not_taken": return { text: "Lead assegnata non ancora presa in carico", to: lead };
    case "lead_not_taken_manager": return { text: "Un venditore non ha preso in carico una lead", to: lead };
    case "lead_waiting": return { text: "Lead nuova in attesa", to: lead };
    case "lead_reminder": return { text: "Promemoria: lead ferma da tempo", to: lead };
    case "deal_signed": return { text: "Pratica firmata: avviare passaggio di proprietà e fatturazione", to: p.deal_id ? `/pratiche/${p.deal_id}` : null };
    default: return { text: n.type, to: lead };
  }
}

export function useNotifications() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["notifications", profile?.id],
    enabled: Boolean(profile),
    queryFn: async () => {
      const { data, error } = await supabase.from("notification").select("id,type,payload,read_at,created_at").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as Notification[];
    },
    refetchInterval: 60_000,
  });
  const markRead = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      const { error } = await supabase.from("notification").update({ read_at: new Date().toISOString() }).in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const unread = (list.data ?? []).filter((n) => !n.read_at);
  return { list, unread, markRead };
}
