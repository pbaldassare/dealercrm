import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Input } from '../../components/ui/input'
import { isValidItalianPlate, normalizePlate } from '../../lib/plate'
import { supabase } from '../../lib/supabase'
import { VEHICLE_KIND_LABEL, type VehicleKind, type VehiclePublic } from '../../lib/vehicle'

const KINDS: Array<VehicleKind | 'all'> = ['all', 'new', 'km0', 'used']

export function VehiclesPage() {
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<VehicleKind | 'all'>('all')
  const [rows, setRows] = useState<VehiclePublic[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void supabase
      .from('vehicle_public')
      .select('id, plate, make, model, trim, kind, status, sale_price, days_in_stock')
      .order('created_at', { ascending: false })
      .then(({ data, error: qError }) => {
        setLoading(false)
        if (qError) setError(qError.message)
        else setRows((data ?? []) as VehiclePublic[])
      })
  }, [])

  const filtered = useMemo(() => {
    const needle = normalizePlate(query)
    return rows.filter((row) => {
      const kindOk = kind === 'all' || row.kind === kind
      if (!needle) return kindOk
      return kindOk && row.plate.includes(needle)
    })
  }, [rows, query, kind])

  const exact = query && isValidItalianPlate(query) ? filtered.find((row) => row.plate === normalizePlate(query)) : null

  return (
    <section className="space-y-4 p-5 pb-24">
      <h1 className="text-2xl font-semibold">Auto</h1>
      <Input
        placeholder="Cerca targa (es. ZZ102AA)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Cerca per targa"
      />
      <div className="flex flex-wrap gap-2">
        {KINDS.map((item) => (
          <button
            key={item}
            type="button"
            className={`min-h-11 rounded-full px-3 text-sm ${kind === item ? 'bg-[#14213d] text-white' : 'bg-white'}`}
            onClick={() => setKind(item)}
          >
            {item === 'all' ? 'Tutte' : VEHICLE_KIND_LABEL[item]}
          </button>
        ))}
      </div>
      {loading && <p className="text-sm text-[#5c6578]">Caricamento stock…</p>}
      {error && <p className="text-sm text-[#9b1c1c]">{error}</p>}
      {!loading && rows.length === 0 && (
        <p className="text-sm text-[#5c6578]">Nessuna auto in stock. L’import demo arriva dopo.</p>
      )}
      {exact && (
        <p className="text-sm">
          Targa trovata:{' '}
          <Link className="font-semibold text-[#c45c26]" to={`/auto/${exact.id}`}>
            {exact.plate}
          </Link>
        </p>
      )}
      <ul className="space-y-3">
        {filtered.map((row) => (
          <li key={row.id}>
            <Link to={`/auto/${row.id}`} className="block rounded-2xl bg-white p-4 shadow-sm">
              <p className="font-semibold">{row.plate}</p>
              <p className="text-sm text-[#5c6578]">
                {row.make} {row.model} · {VEHICLE_KIND_LABEL[row.kind]} · {row.status}
              </p>
              <p className="text-sm">{row.days_in_stock ?? 0} giorni in stock</p>
            </Link>
          </li>
        ))}
      </ul>
      <Link className="inline-flex min-h-11 items-center text-sm font-medium" to="/import">
        Import Excel
      </Link>
    </section>
  )
}
