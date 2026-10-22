import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, fmtDateTime } from "@/lib/utils";
import { describe, useNotifications } from "./notifications";

export function NotificationsPage() {
  const nav = useNavigate();
  const { list, unread, markRead } = useNotifications();
  const rows = list.data ?? [];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h1 className="text-2xl">Notifiche</h1><p className="text-sm text-muted-foreground">{unread.length} da leggere · ultime 100</p></div>
        {unread.length > 0 && <Button size="sm" variant="outline" onClick={() => markRead.mutate(unread.map((n) => n.id))}>Segna tutte come lette</Button>}
      </div>
      <section className="card overflow-hidden">
        {rows.map((n) => {
          const d = describe(n);
          return (
            <button key={n.id} onClick={() => { if (!n.read_at) markRead.mutate([n.id]); if (d.to) nav(d.to); }}
              className={cn("flex w-full items-start gap-3 border-t border-border px-4 py-3 text-left first:border-t-0 hover:bg-muted", !n.read_at && "bg-primary/5")}>
              <Bell className={cn("mt-0.5 h-4 w-4 shrink-0", n.read_at ? "text-muted-foreground" : "text-primary")} />
              <span className="min-w-0 flex-1">
                <span className={cn("block text-sm", !n.read_at && "font-bold")}>{d.text}</span>
                <span className="block text-xs text-muted-foreground">{fmtDateTime(n.created_at)}</span>
              </span>
              {!n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="da leggere" />}
            </button>
          );
        })}
        {!list.isLoading && rows.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nessuna notifica.</p>}
      </section>
    </>
  );
}
