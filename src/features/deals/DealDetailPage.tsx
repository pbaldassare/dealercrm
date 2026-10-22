import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { DEAL_STATUS_IT, formatEuro } from '../../lib/format'
import { dealMargin, type DealItem } from '../../lib/margin'
import { supabase } from '../../lib/supabase'

export function DealDetailPage() {
  const { id } = useParams()
  const [items, setItems] = useState<DealItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const totals = dealMargin(items, false)

  useEffect(() => {
    if (!id) return
    void supabase
      .from('deal_item')
      .select('type, kind, estimated, actual')
      .eq('deal_id', id)
      .then(({ data, error: qError }) => {
        if (qError) setError(qError.message)
        else setItems((data ?? []) as DealItem[])
      })
  }, [id])

  async function signDeal() {
    if (!id) return
    const { error: rpcError } = await supabase.rpc('on_deal_signed', { _deal_id: id })
    if (rpcError) setError(rpcError.message)
    else setNote('Pratica firmata: veicolo sold, annunci in outbox (mock).')
  }

  return (
    <section className="space-y-4 p-5 pb-24">
      <Link to="/pratiche" className="text-sm">
        ← Pratiche
      </Link>
      <h1 className="text-2xl font-semibold">Pratica</h1>
      {error && <p className="text-sm text-[#9b1c1c]">{error}</p>}
      {note && <p className="text-sm text-[#1f7a4d]">{note}</p>}
      <p className="text-lg font-semibold">Margine stimato {formatEuro(totals.margin)}</p>
      <ul className="space-y-2 text-sm">
        {items.map((item) => (
          <li key={item.type} className="rounded-xl bg-white p-3">
            {item.type}: {item.kind} {item.estimated}
          </li>
        ))}
      </ul>
      <Button type="button" onClick={() => void signDeal()}>
        Segna firmata
      </Button>
      <button
        type="button"
        className="min-h-11 text-sm font-medium underline"
        onClick={() => window.print()}
      >
        Stampa / PDF contratto (modello sostituibile)
      </button>
      <p className="text-xs text-[#5c6578]">
        {DEAL_STATUS_IT.contract_pending}. Modello: templates/contratto-vendita.md. Alla firma: veicolo sold, lead won, outbox withdraw mock.
      </p>
    </section>
  )
}
