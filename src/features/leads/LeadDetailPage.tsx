import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { LEAD_STATUS_IT } from '../../lib/format'
import { canChangeLeadStatus, type LeadStatus } from '../../lib/leadStatus'
import { supabase } from '../../lib/supabase'
import { useSession } from '../../lib/session'

type Lead = {
  id: string
  status: LeadStatus
  channel: string
  interest_text: string | null
  source_ref: string | null
  assigned_to: string | null
  assignment_reason: unknown
  customer_id: string
}

type Conv = { id: string; body: string | null; direction: string; at: string }
type Cust = { first_name: string; last_name: string; phone: string | null }

export function LeadDetailPage() {
  const { id } = useParams()
  const { profile } = useSession()
  const [lead, setLead] = useState<Lead | null>(null)
  const [cust, setCust] = useState<Cust | null>(null)
  const [convs, setConvs] = useState<Conv[]>([])
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    void supabase
      .from('lead')
      .select('id, status, channel, interest_text, source_ref, assigned_to, assignment_reason, customer_id')
      .eq('id', id)
      .maybeSingle()
      .then(async ({ data, error: qError }) => {
        if (qError) setError(qError.message)
        else {
          const row = data as Lead | null
          setLead(row)
          if (row) {
            const c = await supabase.from('customer').select('first_name, last_name, phone').eq('id', row.customer_id).maybeSingle()
            if (c.data) setCust(c.data as Cust)
            const v = await supabase.from('conversation').select('id, body, direction, at').eq('lead_id', row.id).order('at')
            if (v.data) setConvs(v.data as Conv[])
          }
        }
      })
  }, [id])

  async function toStatus(next: LeadStatus) {
    if (!id || !lead || !canChangeLeadStatus(lead.status, next)) return
    const { error: rpcError } = await supabase.rpc('change_lead_status', {
      _lead_id: id,
      _to_status: next,
      _payload: next === 'lost' ? { lost_reason: 'no_response' } : {},
    })
    if (rpcError) setError(rpcError.message)
    else {
      setLead({ ...lead, status: next })
      setNote(`Stato aggiornato a ${LEAD_STATUS_IT[next]}`)
    }
  }

  async function reassign() {
    if (!id) return
    const { error: rpcError } = await supabase.rpc('assign_lead', { _lead_id: id })
    if (rpcError) setError(rpcError.message)
    else setNote('Riassegnazione eseguita (fasce, pesi e rotazione da Parametri).')
  }

  const nexts = lead ? (
    [
      ['contacted', 'Segna contattata'],
      ['appointment_set', 'Appuntamento'],
      ['visited', 'Visita fatta'],
      ['proposal_sent', 'Proposta inviata'],
      ['negotiating', 'In trattativa'],
      ['won', 'Vinta'],
      ['lost', 'Persa'],
    ] as const
  ).filter(([s]) => canChangeLeadStatus(lead.status, s)) : []

  return (
    <section className="space-y-4 p-5 pb-24">
      <Link to="/lead" className="text-sm">
        ← Lead
      </Link>
      <h1 className="text-2xl font-semibold">{lead?.source_ref ?? 'Lead'}</h1>
      <p className="text-sm text-[#5c6578]">
        {cust ? `${cust.first_name} ${cust.last_name}` : 'Cliente'} · {LEAD_STATUS_IT[lead?.status ?? ''] ?? lead?.status}
      </p>
      <p>{lead?.interest_text}</p>
      {error && <p className="text-sm text-[#9b1c1c]">{error}</p>}
      {note && <p className="text-sm text-[#1f7a4d]">{note}</p>}
      {cust?.phone && (
        <div className="flex gap-3">
          <a className="inline-flex min-h-11 items-center font-medium text-[#c45c26]" href={`tel:${cust.phone}`}>
            Chiama
          </a>
          <a className="inline-flex min-h-11 items-center font-medium" href={`https://wa.me/${cust.phone.replace('+', '')}`}>
            WhatsApp
          </a>
        </div>
      )}
      {nexts.map(([status, label]) => (
        <Button key={status} type="button" onClick={() => void toStatus(status)}>
          {label}
        </Button>
      ))}
      {(profile?.role === 'sales_manager' || profile?.role === 'admin') && (
        <Button type="button" variant="ghost" onClick={() => void reassign()}>
          Riassegna
        </Button>
      )}
      <h2 className="font-medium">Conversazioni</h2>
      {convs.length === 0 && <p className="text-sm text-[#5c6578]">Nessun messaggio.</p>}
      <ul className="space-y-2 text-sm">
        {convs.map((c) => (
          <li key={c.id} className="rounded-xl bg-white p-3">
            {c.direction}: {c.body}
          </li>
        ))}
      </ul>
    </section>
  )
}
