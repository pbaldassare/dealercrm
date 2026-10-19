import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Clock, Users, Car, FileText, MapPin, SlidersHorizontal, Smartphone, LogOut, BarChart3, Upload, UserCog, type LucideIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ROLE_LABEL, type AppRole } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Item { to: string; label: string; icon: LucideIcon; roles?: AppRole[] }

// Voci di menu per ruolo (sezione 8 della specifica)
const ITEMS: Item[] = [
  { to: "/", label: "Oggi", icon: Clock, roles: ["admin", "owner", "sales_manager", "salesperson"] },
  { to: "/lead", label: "Lead", icon: Users, roles: ["admin", "owner", "sales_manager", "salesperson", "accounting", "finance_insurance", "used_manager", "marketing"] },
  { to: "/auto", label: "Auto", icon: Car },
  { to: "/pratiche", label: "Pratiche", icon: FileText, roles: ["admin", "owner", "sales_manager", "salesperson", "accounting", "finance_insurance", "used_manager"] },
  { to: "/piazzale", label: "Piazzale", icon: MapPin, roles: ["admin", "owner", "sales_manager", "salesperson", "yard", "used_manager", "reconditioning"] },
  { to: "/report", label: "Report", icon: BarChart3, roles: ["admin", "owner", "sales_manager", "accounting", "finance_insurance", "used_manager", "marketing"] },
  { to: "/import", label: "Import", icon: Upload, roles: ["admin", "used_manager"] },
  { to: "/parametri", label: "Parametri", icon: SlidersHorizontal, roles: ["admin", "owner", "sales_manager"] },
  { to: "/utenti", label: "Utenti", icon: UserCog, roles: ["admin"] },
  { to: "/dispositivi", label: "Dispositivi", icon: Smartphone, roles: ["admin"] },
];

export function Shell() {
  const { profile, signOut } = useAuth();
  const role = profile?.role ?? "salesperson";
  const items = ITEMS.filter((i) => !i.roles || i.roles.includes(role));
  const { pathname } = useLocation();
  const current = items.find((i) => (i.to === "/" ? pathname === "/" : pathname.startsWith(i.to)));

  const brand = (
    <div className="flex items-center gap-3">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-gradient-primary text-white shadow-glow">
        <Car className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="truncate font-display text-base font-bold leading-tight">Etideal CRM</div>
        <div className="truncate text-xs text-muted-foreground">{profile ? ROLE_LABEL[profile.role] : ""}</div>
      </div>
    </div>
  );

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background">
      <aside className="hidden w-64 flex-col border-r border-border bg-card md:flex">
        <div className="border-b border-border p-5">{brand}</div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-4">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.to === "/"} className={({ isActive }) => cn("nav-pill", isActive && "active")}>
              <i.icon className="h-4 w-4 shrink-0" /><span className="truncate">{i.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-border p-4">
          <div className="mb-2 truncate text-sm font-semibold">{profile?.full_name}</div>
          <Button variant="outline" size="sm" className="w-full" onClick={signOut}><LogOut className="h-4 w-4" />Esci</Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-border bg-card px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] md:hidden">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-primary text-white"><Car className="h-4 w-4" /></div>
          <h1 className="flex-1 truncate text-lg">{current?.label ?? "Etideal CRM"}</h1>
          <button onClick={signOut} aria-label="Esci" className="rounded-full p-2 text-muted-foreground"><LogOut className="h-5 w-5" /></button>
        </header>
        <main className="flex-1 overflow-y-auto px-4 pb-24 pt-4 md:px-8 md:pb-8 md:pt-6">
          <div className="mx-auto flex max-w-5xl flex-col gap-4 animate-fade-in" key={pathname}>
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
              <div className="absolute bottom-full right-0 mb-2 w-44 rounded-2xl border border-border bg-card p-2 shadow-card">
                {items.slice(4).map((i) => <NavLink key={i.to} to={i.to} className={({ isActive }) => cn("flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold", isActive ? "bg-primary/10 text-primary" : "text-foreground")}><i.icon className="h-4 w-4" />{i.label}</NavLink>)}
              </div>
            </details>
          )}
        </nav>
      </div>
    </div>
  );
}
