import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  BarChart3, Bell, Car, ChevronsLeft, ChevronsRight, Clock, Contact, FileText, Factory, LogOut, MapPin, Megaphone, Search,
  SlidersHorizontal, Smartphone, Upload, UserCog, Users, X, type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ROLE_LABEL, type AppRole } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { GlobalSearch } from "@/components/GlobalSearch";
import { useNotifications } from "@/features/notifications/notifications";
import { flushQueue } from "@/lib/photos";
import { cn } from "@/lib/utils";

interface Item { to: string; label: string; icon: LucideIcon; roles?: AppRole[] }

// Menu per sezione e per ruolo (sezioni 3 e 8 della specifica)
const SECTIONS: Array<{ title: string; items: Item[] }> = [
  { title: "Vendite", items: [
    { to: "/", label: "Oggi", icon: Clock, roles: ["admin", "owner", "sales_manager", "salesperson", "used_manager", "reconditioning", "yard", "marketing"] },
    { to: "/lead", label: "Lead", icon: Users, roles: ["admin", "owner", "sales_manager", "salesperson", "accounting", "finance_insurance", "used_manager", "marketing"] },
    { to: "/clienti", label: "Clienti", icon: Contact, roles: ["admin", "owner", "sales_manager", "salesperson", "accounting", "finance_insurance", "used_manager"] },
    { to: "/pratiche", label: "Pratiche", icon: FileText, roles: ["admin", "owner", "sales_manager", "salesperson", "accounting", "finance_insurance", "used_manager"] },
  ] },
  { title: "Stock", items: [
    { to: "/auto", label: "Auto", icon: Car },
    { to: "/piazzale", label: "Piazzale", icon: MapPin, roles: ["admin", "owner", "sales_manager", "salesperson", "yard", "used_manager", "reconditioning"] },
    { to: "/fornitori", label: "Fornitori", icon: Factory, roles: ["admin", "owner", "sales_manager", "used_manager", "accounting"] },
    { to: "/annunci", label: "Annunci", icon: Megaphone, roles: ["admin", "used_manager", "marketing"] },
  ] },
  { title: "Analisi", items: [
    { to: "/report", label: "Report", icon: BarChart3, roles: ["admin", "owner", "sales_manager", "accounting", "finance_insurance", "used_manager", "marketing"] },
  ] },
  { title: "Amministrazione", items: [
    { to: "/import", label: "Import", icon: Upload, roles: ["admin", "used_manager"] },
    { to: "/utenti", label: "Utenti", icon: UserCog, roles: ["admin"] },
    { to: "/dispositivi", label: "Dispositivi", icon: Smartphone, roles: ["admin"] },
    { to: "/parametri", label: "Parametri", icon: SlidersHorizontal, roles: ["admin", "owner", "sales_manager"] },
  ] },
];

const COLLAPSE_KEY = "dealercrm.sidebar.collapsed";
const readCollapsed = () => { try { return localStorage.getItem(COLLAPSE_KEY) === "1"; } catch { return false; } };

export function Shell() {
  const { profile, signOut } = useAuth();
  const role = profile?.role ?? "salesperson";
  const sections = SECTIONS.map((s) => ({ ...s, items: s.items.filter((i) => !i.roles || i.roles.includes(role)) })).filter((s) => s.items.length);
  const items = sections.flatMap((s) => s.items);
  const { pathname } = useLocation();
  const current = items.find((i) => (i.to === "/" ? pathname === "/" : pathname.startsWith(i.to)));
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [searching, setSearching] = useState(false);
  const { unread } = useNotifications();

  useEffect(() => { try { localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0"); } catch { /* storage bloccato */ } }, [collapsed]);
  useEffect(() => { setSearching(false); }, [pathname]);
  // foto rimaste in coda da una sessione senza rete: si inviano appena l'utente è dentro
  useEffect(() => { void flushQueue(); }, []);

  const bell = (
    <Link to="/notifiche" aria-label={`Notifiche${unread.length ? `, ${unread.length} da leggere` : ""}`} className="relative rounded-full p-2 text-muted-foreground hover:bg-secondary">
      <Bell className="h-5 w-5" />
      {unread.length > 0 && <span className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">{unread.length > 99 ? "99+" : unread.length}</span>}
    </Link>
  );

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background">
      <aside className={cn("hidden shrink-0 flex-col border-r border-border bg-card transition-[width] duration-300 md:flex", collapsed ? "w-[76px]" : "w-64")}>
        <div className={cn("flex items-center gap-3 border-b border-border p-4", collapsed && "justify-center px-2")}>
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-gradient-primary text-white shadow-glow"><Car className="h-5 w-5" /></div>
          {!collapsed && <div className="min-w-0"><div className="truncate font-display text-base font-bold leading-tight">Dealer CRM</div><div className="truncate text-xs text-muted-foreground">{profile ? ROLE_LABEL[profile.role] : ""}</div></div>}
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto p-3">
          {sections.map((s) => (
            <div key={s.title}>
              {!collapsed && <div className="mb-1 px-4 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{s.title}</div>}
              <div className="space-y-1">
                {s.items.map((i) => (
                  <NavLink key={i.to} to={i.to} end={i.to === "/"} title={collapsed ? i.label : undefined}
                    className={({ isActive }) => cn("nav-pill", isActive && "active", collapsed && "justify-center px-0")}>
                    <i.icon className="h-4 w-4 shrink-0" />{!collapsed && <span className="truncate">{i.label}</span>}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="space-y-2 border-t border-border p-3">
          {!collapsed && <div className="truncate px-1 text-sm font-semibold">{profile?.full_name}</div>}
          <div className={cn("flex gap-2", collapsed && "flex-col items-center")}>
            <Button variant="outline" size="sm" className={cn(!collapsed && "flex-1")} onClick={signOut} title="Esci"><LogOut className="h-4 w-4" />{!collapsed && "Esci"}</Button>
            <Button variant="ghost" size="sm" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Espandi il menu" : "Riduci il menu"}>
              {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* barra in alto da computer: ricerca globale e notifiche */}
        <header className="hidden items-center gap-4 border-b border-border bg-card px-8 py-3 md:flex">
          <GlobalSearch className="max-w-md flex-1" />
          <div className="ml-auto flex items-center gap-2">{bell}</div>
        </header>
        {/* barra in alto da telefono */}
        <header className="flex items-center gap-2 border-b border-border bg-card px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] md:hidden">
          {searching ? (
            <>
              <GlobalSearch autoFocus className="flex-1" onDone={() => setSearching(false)} />
              <button onClick={() => setSearching(false)} aria-label="Chiudi la ricerca" className="rounded-full p-2 text-muted-foreground"><X className="h-5 w-5" /></button>
            </>
          ) : (
            <>
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-primary text-white"><Car className="h-4 w-4" /></div>
              <h1 className="flex-1 truncate text-lg">{current?.label ?? "Dealer CRM"}</h1>
              <button onClick={() => setSearching(true)} aria-label="Cerca" className="rounded-full p-2 text-muted-foreground"><Search className="h-5 w-5" /></button>
              {bell}
              <button onClick={signOut} aria-label="Esci" className="rounded-full p-2 text-muted-foreground"><LogOut className="h-5 w-5" /></button>
            </>
          )}
        </header>
        <main className="flex-1 overflow-y-auto px-4 pb-24 pt-4 md:px-8 md:pb-8 md:pt-6">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 animate-fade-in" key={pathname}>
            <Outlet />
          </div>
        </main>
        <nav className="fixed inset-x-0 bottom-0 z-10 flex justify-around border-t border-border bg-card px-2 pb-[calc(0.4rem+env(safe-area-inset-bottom))] pt-1.5 md:hidden">
          {(items.length > 5 ? items.slice(0, 4) : items).map((i) => (
            <NavLink key={i.to} to={i.to} end={i.to === "/"}
              className={({ isActive }) => cn("flex min-w-[52px] flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[11px] font-bold text-muted-foreground", isActive && "bg-primary/10 text-primary")}>
              <i.icon className="h-5 w-5" />{i.label}
            </NavLink>
          ))}
          {items.length > 5 && (
            <details className="relative">
              <summary className="flex min-w-[52px] cursor-pointer list-none flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[11px] font-bold text-muted-foreground"><SlidersHorizontal className="h-5 w-5" />Altro</summary>
              <div className="absolute bottom-full right-0 mb-2 max-h-[70dvh] w-48 overflow-y-auto rounded-2xl border border-border bg-card p-2 shadow-card">
                {items.slice(4).map((i) => <NavLink key={i.to} to={i.to} className={({ isActive }) => cn("flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold", isActive ? "bg-primary/10 text-primary" : "text-foreground")}><i.icon className="h-4 w-4" />{i.label}</NavLink>)}
              </div>
            </details>
          )}
        </nav>
      </div>
    </div>
  );
}
