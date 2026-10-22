import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatTime, LEAD_STATUS_IT } from '../../lib/format'
import { remainingTone } from '../../lib/leadStatus'
import { supabase } from '../../lib/supabase'
import { useSession } from '../../lib/session'

type LeadRow = {
  id: string
  status: string
  interest_text: string | null
  remaining_seconds: number | null
  source_ref: string | null
}
type Appt = { id: string; starts_at: string; lead_id: string }
type Alert = { id: string; type: string }

export function TodayPage() {
  const { profile } = useSession()
  const [leads, setLeads] = useState<LeadRow[]>([])
  const [appts, setAppts] = useState<Appt[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void Promise.all([
      supabase
        .from('lead_open')
        .select('id, status, interest_text, remaining_seconds, source_ref')
        .order('status_deadline_at', { ascending: true, nullsFirst: false })
        .limit(20),
      supabase.from('appointment').select('id, starts_at, lead_id').gte('starts_at', new Date().toISOString().slice(0, 10)).order('starts_at'),
      supabase.from('notification').select('id, type').is('read_at', null).limit(10),
    ]).then(([l, a, n]) => {
      if (l.error) setError(l.error.message)
      else setLeads((l.data ?? []) as LeadRow[])
      if (!a.error) setAppts((a.data ?? []) as Appt[])
      if (!n.error) setAlerts((n.data ?? []) as Alert[])
    })
  }, [])

  return (
    <section className="space-y-4 p-5 pb-24">
      <h1 className="text-2xl font-semibold">Oggi</h1>
      <p className="text-[15px] text-[#5c6578]">Ciao {profile?.full_name}. Prima le lead in scadenza.</p>
      {error && <p className="text-sm text-[#9b1c1c]">{error}</p>}
      {leads.length === 0 && <p className="text-sm text-[#5c6578]">Nessuna lead aperta visibile.</p>}
      <ul className="space-y-3">
        {leads.map((row) => {
          const tone = remainingTone(row.remaining_seconds, 15)
          const color = tone === 'red' ? 'text-[#9b1c1c]' : tone === 'orange' ? 'text-[#c45c26]' : 'text-[#1f7a4d]'
          return (
            <li key={row.id}>
              <Link to={`/lead/${row.id}`} className="block min-h-11 rounded-2xl bg-white p-4 shadow-sm">
                <p className="font-medium">{row.source_ref ?? 'Lead'} · {row.interest_text}</p>
                <p className={`text-sm ${color}`}>
                  {LEAD_STATUS_IT[row.status] ?? row.status} ·{' '}
                  {row.remaining_seconds == null ? 'senza timer' : `${Math.round(row.remaining_seconds / 60)} min`}
                </p>
              </Link>
            </li>
          )
        })}
      </ul>
      <h2 className="font-medium">Appuntamenti di oggi</h2>
      {appts.length === 0 && <p className="text-sm text-[#5c6578]">Nessun appuntamento.</p>}
      <ul className="space-y-2 text-sm">
        {appts.map((a) => (
          <li key={a.id} className="rounded-xl bg-white p-3">
            {formatTime(a.starts_at)} ·{' '}
            <Link className="text-[#c45c26]" to={`/lead/${a.lead_id}`}>
              apri lead
            </Link>
          </li>
        ))}
      </ul>
      {alerts.length > 0 && <p className="text-sm">{alerts.length} avvisi non letti.</p>}
    </section>
  )
}
