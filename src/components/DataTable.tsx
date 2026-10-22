import { useMemo, useState, type ReactNode } from "react";
import * as XLSX from "xlsx";
import { ArrowDown, ArrowUp, Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** valore per ordinamento ed export; senza, la colonna non si ordina e non si esporta */
  value?: (row: T) => string | number | null | undefined;
  className?: string;
}

interface Props<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  /** testo in cui cercare per ogni riga */
  searchText?: (row: T) => string;
  searchPlaceholder?: string;
  /** filtri a pillole sopra la tabella */
  filters?: Array<{ key: string; label: string; test: (row: T) => boolean }>;
  onRowClick?: (row: T) => void;
  /** riga compatta per il telefono (sotto i 768 px); senza, anche lì si usa la tabella */
  mobileRow?: (row: T) => ReactNode;
  selectable?: boolean;
  selected?: Set<string>;
  onSelectedChange?: (s: Set<string>) => void;
  /** azioni sulle righe selezionate */
  bulkActions?: ReactNode;
  exportName?: string;
  toolbar?: ReactNode;
  loading?: boolean;
  empty?: string;
  pageSize?: number;
  initialSort?: { key: string; dir: "asc" | "desc" };
}

/** Tabella del backoffice: ricerca, filtri, ordinamento, pagine, selezione, export in Excel. Sul telefono diventa un elenco. */
export function DataTable<T>(p: Props<T>) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string | null>(null);
  const [sort, setSort] = useState(p.initialSort ?? null);
  const [page, setPage] = useState(0);
  const size = p.pageSize ?? 25;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = p.rows;
    if (q && p.searchText) out = out.filter((r) => p.searchText!(r).toLowerCase().includes(q));
    const f = p.filters?.find((x) => x.key === filter);
    if (f) out = out.filter(f.test);
    const col = sort && p.columns.find((c) => c.key === sort.key);
    if (col?.value) {
      const dir = sort!.dir === "asc" ? 1 : -1;
      out = [...out].sort((a, b) => {
        const x = col.value!(a), y = col.value!(b);
        if (x == null && y == null) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "it", { numeric: true })) * dir;
      });
    }
    return out;
  }, [p.rows, p.searchText, p.filters, p.columns, query, filter, sort]);

  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(page, pages - 1);
  const visible = rows.slice(current * size, current * size + size);
  const sel = p.selected ?? new Set<string>();
  const allVisibleSelected = visible.length > 0 && visible.every((r) => sel.has(p.rowKey(r)));

  const toggle = (id: string) => { const s = new Set(sel); if (s.has(id)) s.delete(id); else s.add(id); p.onSelectedChange?.(s); };
  const toggleAll = () => { const s = new Set(sel); visible.forEach((r) => (allVisibleSelected ? s.delete(p.rowKey(r)) : s.add(p.rowKey(r)))); p.onSelectedChange?.(s); };
  const sortBy = (c: Column<T>) => {
    if (!c.value) return;
    setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === "asc" ? "desc" : "asc" } : { key: c.key, dir: "asc" }));
  };
  const exportXlsx = () => {
    const cols = p.columns.filter((c) => c.value);
    const data = rows.map((r) => Object.fromEntries(cols.map((c) => [c.header, c.value!(r) ?? ""])));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Dati");
    XLSX.writeFile(wb, `${p.exportName ?? "export"}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {p.searchText && (
          <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-full border border-input bg-card px-4 py-1.5 md:max-w-sm">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} placeholder={p.searchPlaceholder ?? "Cerca"} className="h-8 min-w-0 flex-1 bg-transparent outline-none" />
          </label>
        )}
        {p.toolbar}
        {p.exportName && <Button size="sm" variant="outline" onClick={exportXlsx} disabled={!rows.length}><Download className="h-4 w-4" />Excel</Button>}
      </div>
      {p.filters && (
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {[{ key: null as string | null, label: "Tutti" }, ...p.filters].map((f) => (
            <button key={f.key ?? "all"} onClick={() => { setFilter(f.key); setPage(0); }}
              className={cn("shrink-0 rounded-full border border-input bg-card px-3.5 py-1.5 text-sm font-semibold", filter === f.key && "border-primary bg-primary text-primary-foreground")}>
              {f.label}{f.key && <span className="ml-1.5 opacity-70">{p.rows.filter(p.filters!.find((x) => x.key === f.key)!.test).length}</span>}
            </button>
          ))}
        </div>
      )}
      {p.selectable && sel.size > 0 && (
        <div className="card flex flex-wrap items-center gap-2 border-primary px-4 py-2.5 text-sm">
          <b>{sel.size} selezionate</b>{p.bulkActions}
          <Button size="sm" variant="ghost" onClick={() => p.onSelectedChange?.(new Set())}>Deseleziona</Button>
        </div>
      )}

      <section className="card overflow-hidden">
        {p.mobileRow && <div className="md:hidden">{visible.map((r) => <div key={p.rowKey(r)} className="border-t border-border first:border-t-0">{p.mobileRow!(r)}</div>)}</div>}
        <div className={cn("overflow-x-auto", p.mobileRow && "hidden md:block")}>
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {p.selectable && <th className="w-10 px-3 py-2.5"><input type="checkbox" aria-label="Seleziona tutte" checked={allVisibleSelected} onChange={toggleAll} className="h-4 w-4 accent-[hsl(var(--primary))]" /></th>}
                {p.columns.map((c) => (
                  <th key={c.key} className={cn("whitespace-nowrap px-3 py-2.5 font-bold", c.value && "cursor-pointer select-none hover:text-foreground", c.className)} onClick={() => sortBy(c)}>
                    <span className="inline-flex items-center gap-1">{c.header}{sort?.key === c.key && (sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const id = p.rowKey(r);
                return (
                  <tr key={id} onClick={() => p.onRowClick?.(r)} className={cn("border-t border-border first:border-t-0", p.onRowClick && "cursor-pointer hover:bg-muted/60", sel.has(id) && "bg-primary/5")}>
                    {p.selectable && <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label="Seleziona" checked={sel.has(id)} onChange={() => toggle(id)} className="h-4 w-4 accent-[hsl(var(--primary))]" /></td>}
                    {p.columns.map((c) => <td key={c.key} className={cn("px-3 py-2.5 align-middle", c.className)}>{c.cell(r)}</td>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!p.loading && rows.length === 0 && <p className="p-4 text-sm text-muted-foreground">{p.empty ?? "Nessun risultato."}</p>}
        {p.loading && <p className="p-4 text-sm text-muted-foreground">Carico…</p>}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>{rows.length} {rows.length === 1 ? "riga" : "righe"}{rows.length !== p.rows.length && ` su ${p.rows.length}`}</span>
        {pages > 1 && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setPage(current - 1)} disabled={current === 0}>‹</Button>
            <span className="tabular-nums">{current + 1} / {pages}</span>
            <Button size="sm" variant="outline" onClick={() => setPage(current + 1)} disabled={current >= pages - 1}>›</Button>
          </div>
        )}
      </div>
    </div>
  );
}
