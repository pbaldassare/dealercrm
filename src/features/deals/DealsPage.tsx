import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { DEAL_STATUS_IT, formatEuro } from '../../lib/format'
import { supabase } from '../../lib/supabase'

type Row = { deal_id: string; status: string; estimated_margin: number; actual_margin: number }

export function DealsPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void supabase
      .from('deal_margin')
      .select('deal_id, status, estimated_margin, actual_margin')
      .then(({ data, error: qError }) => {
        if (qError) setError(qError.message)
        else setRows((data ?? []) as Row[])
      })
  }, [])

  return (
    <section className="space-y-4 p-5 pb-24">
      <h1 className="text-2xl font-semibold">Pratiche</h1>
      {error && <p className="text-sm text-[#9b1c1c]">{error}</p>}
      {rows.length === 0 && <p className="text-sm text-[#5c6578]">Nessuna pratica. Il margine stimato usa le voci in deal_item.</p>}
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.deal_id}>
            <Link to={`/pratiche/${row.deal_id}`} className="block rounded-2xl bg-white p-4 shadow-sm">
              <p className="font-medium">P-001 · {DEAL_STATUS_IT[row.status] ?? row.status}</p>
              <p className="text-sm">
                Margine stimato {formatEuro(Number(row.estimated_margin))} · reale {formatEuro(Number(row.actual_margin))}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
