import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { LEAD_STATUS_IT } from '../../lib/format'
import { remainingTone } from '../../lib/leadStatus'
import { supabase } from '../../lib/supabase'

type LeadRow = {
  id: string
  status: string
  channel: string
  interest_text: string | null
  remaining_seconds: number | null
  source_ref: string | null
}

export function LeadsPage() {
  const [rows, setRows] = useState<LeadRow[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void supabase
      .from('lead_open')
      .select('id, status, channel, interest_text, remaining_seconds, source_ref')
      .order('status_deadline_at', { ascending: true, nullsFirst: false })
      .then(({ data, error: qError }) => {
        if (qError) setError(qError.message)
        else setRows((data ?? []) as LeadRow[])
      })
  }, [])

  return (
    <section className="space-y-4 p-5 pb-24">
      <h1 className="text-2xl font-semibold">Lead</h1>
      {error && <p className="text-sm text-[#9b1c1c]">{error}</p>}
      {rows.length === 0 && <p className="text-sm text-[#5c6578]">Nessuna lead aperta.</p>}
      <ul className="space-y-3">
        {rows.map((row) => {
          const tone = remainingTone(row.remaining_seconds, 15)
          const color = tone === 'red' ? 'text-[#9b1c1c]' : tone === 'orange' ? 'text-[#c45c26]' : 'text-[#1f7a4d]'
          return (
            <li key={row.id}>
              <Link to={`/lead/${row.id}`} className="block min-h-11 rounded-2xl bg-white p-4 shadow-sm">
                <p className="font-medium">{row.source_ref ?? row.channel}</p>
                <p className="text-sm">{row.interest_text}</p>
                <p className={`text-sm ${color}`}>
                  {LEAD_STATUS_IT[row.status] ?? row.status} ·{' '}
                  {row.remaining_seconds == null ? 'senza timer' : `${Math.round((row.remaining_seconds || 0) / 60)} min`}
                </p>
              </Link>
            </li>
          )
        })}
      </ul>
      <Link className="inline-flex min-h-11 items-center text-sm font-medium" to="/lead-inbound">
        Simula ingresso lead
      </Link>
    </section>
  )
}
