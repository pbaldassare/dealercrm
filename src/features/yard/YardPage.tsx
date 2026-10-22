import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'

type Slot = { id: string; code: string; zone: string }
type Veh = { id: string; plate: string; make: string | null; model: string | null; yard_slot_id: string | null; days_in_stock: number | null }

export function YardPage() {
  const mapsKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  const [slots, setSlots] = useState<Slot[]>([])
  const [vehicles, setVehicles] = useState<Veh[]>([])
  const [selectedPlate, setSelectedPlate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  async function load() {
    const [s, v] = await Promise.all([
      supabase.from('yard_slot').select('id, code, yard_zone(code)'),
      supabase.from('vehicle_public').select('id, plate, make, model, yard_slot_id, days_in_stock'),
    ])
    if (s.error) setError(s.error.message)
    else {
      setSlots(
        (s.data ?? []).map((row) => {
          const r = row as { id: string; code: string; yard_zone: { code: string } | { code: string }[] | null }
          const zone = Array.isArray(r.yard_zone) ? r.yard_zone[0]?.code : r.yard_zone?.code
          return { id: r.id, code: r.code, zone: zone ?? '?' }
        }),
      )
    }
    if (!v.error) setVehicles((v.data ?? []) as Veh[])
  }

  useEffect(() => {
    void load()
  }, [])

  const bySlot = useMemo(() => {
    const map = new Map<string, Veh>()
    for (const veh of vehicles) {
      if (veh.yard_slot_id) map.set(veh.yard_slot_id, veh)
    }
    return map
  }, [vehicles])

  async function park(slotId: string) {
    const veh = vehicles.find((x) => x.plate === selectedPlate)
    if (!veh) {
      setError('Scegli una targa.')
      return
    }
    const { error: rpcError } = await supabase.rpc('set_vehicle_yard_position', {
      _vehicle_id: veh.id,
      _slot_id: slotId,
      _yard_status: 'in_yard',
    })
    if (rpcError) setError(rpcError.message)
    else {
      setNote(`Posizione di ${veh.plate} aggiornata.`)
      void load()
    }
  }

  const zones = [...new Set(slots.map((s) => s.zone))]

  return (
    <section className="space-y-4 p-5 pb-24">
      <h1 className="text-2xl font-semibold">Piazzale</h1>
      {!mapsKey && (
        <p className="rounded-xl bg-[#fde8d8] p-3 text-sm">Senza chiave Maps mostriamo la griglia per zona.</p>
      )}
      {error && <p className="text-sm text-[#9b1c1c]">{error}</p>}
      {note && <p className="text-sm text-[#1f7a4d]">{note}</p>}
      <label className="block text-sm">
        Targa da posizionare
        <select
          className="mt-1 min-h-11 w-full rounded-xl border border-[#d9d1c7] bg-white px-3"
          value={selectedPlate}
          onChange={(e) => setSelectedPlate(e.target.value)}
        >
          <option value="">Scegli…</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.plate}>
              {v.plate} · {v.make} {v.model}
            </option>
          ))}
        </select>
      </label>
      {zones.map((zone) => (
        <div key={zone}>
          <h2 className="mb-2 font-medium">Zona {zone}</h2>
          <div className="grid grid-cols-4 gap-2">
            {slots
              .filter((s) => s.zone === zone)
              .map((slot) => {
                const occ = bySlot.get(slot.id)
                return (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={() => void park(slot.id)}
                    className={`min-h-14 rounded-xl p-2 text-center text-xs shadow-sm ${occ ? 'bg-[#fde8d8]' : 'bg-white'}`}
                  >
                    <p className="font-semibold">{slot.code}</p>
                    <p className="text-[#5c6578]">{occ ? occ.plate : 'libero'}</p>
                  </button>
                )
              })}
          </div>
        </div>
      ))}
    </section>
  )
}
