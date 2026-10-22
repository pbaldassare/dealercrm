import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

type Totals = { openLeads: number; stock: number; over60: number; deals: number }
type Seller = { full_name: string; close_rate_90: number; leads_received_30: number; avg_response_minutes: number | null }

export function ReportsPage() {
  const [totals, setTotals] = useState<Totals>({ openLeads: 0, stock: 0, over60: 0, deals: 0 })
  const [sellers, setSellers] = useState<Seller[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void Promise.all([
      supabase.from('lead_open').select('id', { count: 'exact', head: true }),
      supabase.from('vehicle_stock').select('id, days_in_stock'),
      supabase.from('deal_margin').select('deal_id', { count: 'exact', head: true }),
      supabase.from('salesperson_stats').select('full_name, close_rate_90, leads_received_30, avg_response_minutes'),
    ]).then(([leads, stock, deals, stats]) => {
      if (leads.error || stock.error || deals.error) {
        setError(leads.error?.message || stock.error?.message || deals.error?.message || 'errore')
        return
      }
      const vehicles = (stock.data ?? []) as { days_in_stock: number | null }[]
      setTotals({
        openLeads: leads.count ?? 0,
        stock: vehicles.length,
        over60: vehicles.filter((v) => (v.days_in_stock ?? 0) > 60).length,
        deals: deals.count ?? 0,
      })
      if (!stats.error) setSellers((stats.data ?? []) as Seller[])
    })
  }, [])

  return (
    <section className="space-y-4 p-5 pb-24">
      <h1 className="text-2xl font-semibold">Report</h1>
      {error && <p className="text-sm text-[#9b1c1c]">{error}</p>}
      <ul className="grid grid-cols-2 gap-3">
        <li className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-sm text-[#5c6578]">Lead aperte</p>
          <p className="text-2xl font-semibold">{totals.openLeads}</p>
        </li>
        <li className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-sm text-[#5c6578]">Auto in stock</p>
          <p className="text-2xl font-semibold">{totals.stock}</p>
        </li>
        <li className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-sm text-[#5c6578]">Ferme oltre 60 giorni</p>
          <p className="text-2xl font-semibold">{totals.over60}</p>
        </li>
        <li className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-sm text-[#5c6578]">Pratiche</p>
          <p className="text-2xl font-semibold">{totals.deals}</p>
        </li>
      </ul>
      <h2 className="font-medium">Venditori (90 giorni)</h2>
      <ul className="space-y-2 text-sm">
        {sellers.map((s) => (
          <li key={s.full_name} className="rounded-xl bg-white p-3">
            {s.full_name}: chiusura {(s.close_rate_90 * 100).toFixed(0)}% · {s.leads_received_30} lead / 30 gg · risposta{' '}
            {s.avg_response_minutes ?? '—'} min
          </li>
        ))}
      </ul>
    </section>
  )
}
