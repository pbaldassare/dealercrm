import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

type Row = {
  id: string
  name: string
  type: string
  reliability: number | null
}

export function SuppliersPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState<string | null>(null)
  const [counts, setCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    void Promise.all([
      supabase.from('supplier').select('id, name, type, reliability').order('name'),
      supabase.from('vehicle_public').select('id, supplier_id'),
    ]).then(([s, v]) => {
      if (s.error) setError(s.error.message)
      else setRows((s.data ?? []) as Row[])
      const map: Record<string, number> = {}
      for (const row of (v.data ?? []) as { supplier_id: string | null }[]) {
        if (row.supplier_id) map[row.supplier_id] = (map[row.supplier_id] ?? 0) + 1
      }
      setCounts(map)
    })
  }, [])

  return (
    <section className="space-y-4 p-5 pb-24">
      <h1 className="text-2xl font-semibold">Fornitori</h1>
      {error && <p className="text-sm text-[#9b1c1c]">{error}</p>}
      {rows.length === 0 && <p className="text-sm text-[#5c6578]">Nessun fornitore visibile per il tuo ruolo.</p>}
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.id} className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="font-medium">{row.name}</p>
            <p className="text-sm text-[#5c6578]">
              {row.type} · affidabilità {row.reliability ?? '—'}/5 · {counts[row.id] ?? 0} auto in stock
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}
