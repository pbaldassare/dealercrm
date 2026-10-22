import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { VEHICLE_STATUS_IT } from '../../lib/format'
import { VEHICLE_KIND_LABEL, type VehiclePublic } from '../../lib/vehicle'

type EventRow = { id: string; at: string; type: string; from_status: string | null; to_status: string | null }

export function VehicleDetailPage() {
  const { id } = useParams()
  const [vehicle, setVehicle] = useState<VehiclePublic | null>(null)
  const [events, setEvents] = useState<EventRow[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    void Promise.all([
      supabase.from('vehicle_public').select('*').eq('id', id).maybeSingle(),
      supabase.from('vehicle_event').select('id, at, type, from_status, to_status').eq('vehicle_id', id).order('at', { ascending: false }),
    ]).then(([v, e]) => {
      if (v.error) setError(v.error.message)
      else setVehicle(v.data as VehiclePublic | null)
      if (!e.error) setEvents((e.data ?? []) as EventRow[])
    })
  }, [id])

  if (error) return <p className="p-5 text-sm text-[#9b1c1c]">{error}</p>
  if (!vehicle) return <p className="p-5 text-sm text-[#5c6578]">Scheda non trovata.</p>

  return (
    <section className="space-y-4 p-5 pb-24">
      <Link to="/auto" className="text-sm">
        ← Elenco
      </Link>
      <h1 className="text-2xl font-semibold">{vehicle.plate}</h1>
      <p className="text-[#5c6578]">
        {vehicle.make} {vehicle.model} {vehicle.trim} · {VEHICLE_KIND_LABEL[vehicle.kind]}
      </p>
      <p className="text-sm">
        Stato {VEHICLE_STATUS_IT[vehicle.status] ?? vehicle.status} · {vehicle.days_in_stock ?? 0} giorni in stock
      </p>
      <Link className="inline-flex min-h-11 items-center text-sm font-medium text-[#c45c26]" to="/condizioni">
        Check condizioni
      </Link>
      <h2 className="pt-2 font-medium">Storico</h2>
      {events.length === 0 && <p className="text-sm text-[#5c6578]">Nessun evento ancora.</p>}
      <ul className="space-y-2 text-sm">
        {events.map((event) => (
          <li key={event.id} className="rounded-xl bg-white p-3">
            {event.at}: {event.type}
            {event.from_status && event.to_status ? ` (${event.from_status} → ${event.to_status})` : ''}
          </li>
        ))}
      </ul>
    </section>
  )
}
