import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { supabase } from '../../lib/supabase'

const STEPS = ['Carburante', 'Chilometri', 'Chiavi', 'Spie', 'Pneumatici', 'Danni', 'Foto'] as const

export function ConditionsPage() {
  const [step, setStep] = useState(0)
  const [vehicleId, setVehicleId] = useState('40000000-0000-4000-8000-000000000005')
  const [fuel, setFuel] = useState('quarter')
  const [km, setKm] = useState('96000')
  const [keys, setKeys] = useState('2')
  const [diff, setDiff] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  useEffect(() => {
    void supabase
      .rpc('compare_conditions', {
        _vehicle_id: vehicleId,
        _from: 'intake',
        _to: 'during',
      })
      .then(({ data, error: qError }) => {
        if (qError) setDiff(null)
        else setDiff(JSON.stringify(data, null, 2))
      })
  }, [vehicleId])

  async function save() {
    setError(null)
    const { error: iError } = await supabase.from('vehicle_condition').insert({
      vehicle_id: vehicleId,
      phase: 'intake',
      fuel_level: fuel,
      mileage_km: Number(km),
      keys_count: Number(keys),
      notes: 'Check da app',
    })
    if (iError) setError(iError.message)
    else setSaved('Check salvato. Le foto obbligatorie (4 angoli, laterali, interni, cruscotto, bagagliaio) si caricano nel bucket vehicle-photos.')
  }

  return (
    <section className="space-y-4 p-5 pb-24">
      <h1 className="text-2xl font-semibold">Check condizioni</h1>
      <p className="text-sm text-[#5c6578]">
        Passo {step + 1} di {STEPS.length}: {STEPS[step]}. Foto dal telefono con `capture`.
      </p>
      <label className="block text-sm">
        Veicolo
        <Input className="mt-1" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} />
      </label>
      {step === 0 && (
        <label className="block text-sm">
          Carburante
          <select className="mt-1 min-h-11 w-full rounded-xl border border-[#d9d1c7] bg-white px-3" value={fuel} onChange={(e) => setFuel(e.target.value)}>
            <option value="empty">Vuoto</option>
            <option value="quarter">1/4</option>
            <option value="half">1/2</option>
            <option value="three_quarters">3/4</option>
            <option value="full">Pieno</option>
          </select>
        </label>
      )}
      {step === 1 && (
        <label className="block text-sm">
          Chilometri (foto cruscotto)
          <Input className="mt-1" value={km} onChange={(e) => setKm(e.target.value)} />
          <input className="mt-2" type="file" accept="image/*" capture="environment" />
        </label>
      )}
      {step === 2 && (
        <label className="block text-sm">
          Chiavi
          <Input className="mt-1" value={keys} onChange={(e) => setKeys(e.target.value)} />
        </label>
      )}
      {step >= 3 && <p className="text-sm">Segna spie, pneumatici, danni per zona e scatta le foto obbligatorie.</p>}
      <div className="flex gap-2">
        <Button type="button" variant="ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          Indietro
        </Button>
        {step < STEPS.length - 1 ? (
          <Button type="button" onClick={() => setStep((s) => s + 1)}>
            Avanti
          </Button>
        ) : (
          <Button type="button" onClick={() => void save()}>
            Salva check
          </Button>
        )}
      </div>
      {error && <p className="text-sm text-[#9b1c1c]">{error}</p>}
      {saved && <p className="text-sm text-[#1f7a4d]">{saved}</p>}
      <h2 className="font-medium">Confronto ingresso / dopo lavorazione</h2>
      {diff ? (
        <pre className="overflow-auto rounded-xl bg-white p-3 text-xs">{diff}</pre>
      ) : (
        <p className="text-sm text-[#5c6578]">Nessun confronto (serve il ruolo condizioni).</p>
      )}
    </section>
  )
}
