import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/button'
import { supabase } from '../../lib/supabase'
import { useSession } from '../../lib/session'
import type { Setting } from '../../lib/types'

const LABELS: Record<string, string> = {
  lead_timers: 'Timer lead',
  value_bands: 'Fasce di valore',
  assignment_weights: 'Pesi assegnazione',
  assignment_params: 'Parametri assegnazione',
  ai_switches: 'Interruttori IA',
  ai_handoff: 'Passaggio a un umano',
  vehicle_alerts: 'Allerte veicoli',
  portal_rules: 'Regole portali',
}

export function SettingsPage() {
  const { profile } = useSession()
  const [rows, setRows] = useState<Setting[]>([])
  const [editing, setEditing] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const canEdit = profile?.role === 'admin' || profile?.role === 'owner' || profile?.role === 'sales_manager'

  useEffect(() => {
    void supabase
      .from('setting')
      .select('*')
      .then(({ data, error: qError }) => {
        if (qError) setError(qError.message)
        else {
          const list = (data ?? []) as Setting[]
          setRows(list)
          setEditing(Object.fromEntries(list.map((row) => [row.id, JSON.stringify(row.value, null, 2)])))
        }
      })
  }, [])

  async function save(row: Setting) {
    setError(null)
    setSaved(null)
    let parsed: unknown
    try {
      parsed = JSON.parse(editing[row.id] ?? '')
    } catch {
      setError(`JSON non valido per ${row.key}`)
      return
    }
    const { error: uError } = await supabase
      .from('setting')
      .update({ value: parsed, updated_by: profile?.id })
      .eq('id', row.id)
    if (uError) setError(uError.message)
    else setSaved(`Salvato ${row.key}. Lo storico è in setting_history.`)
  }

  return (
    <section className="space-y-4 p-5 pb-24">
      <h1 className="text-2xl font-semibold">Parametri</h1>
      <p className="text-sm text-[#5c6578]">
        Timer, pesi e interruttori IA. I valori non sono nel codice: si modificano qui.
      </p>
      {error && <p className="text-sm text-[#9b1c1c]">{error}</p>}
      {saved && <p className="text-sm text-[#1f7a4d]">{saved}</p>}
      {rows.length === 0 && <p className="text-sm text-[#5c6578]">Nessun parametro visibile per questo profilo.</p>}
      {rows.map((row) => (
        <article key={row.id} className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="font-medium">{LABELS[row.key] ?? row.key}</h2>
          <textarea
            className="mt-2 min-h-32 w-full rounded-xl border border-[#d9d1c7] p-2 font-mono text-xs"
            value={editing[row.id] ?? ''}
            disabled={!canEdit}
            onChange={(e) => setEditing((prev) => ({ ...prev, [row.id]: e.target.value }))}
          />
          {canEdit && (
            <Button className="mt-3" type="button" onClick={() => void save(row)}>
              Salva
            </Button>
          )}
        </article>
      ))}
    </section>
  )
}
