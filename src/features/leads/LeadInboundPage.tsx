import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { mockQualify } from '../../lib/leadStatus'

export function LeadInboundPage() {
  const [message, setMessage] = useState('Buongiorno, la Audi A3 è ancora disponibile?')
  const [result, setResult] = useState<string | null>(null)

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    const q = mockQualify(message)
    setResult(
      `Mock inbound: stato new → ai_qualifying. Punteggio ${q.score} (${q.temperature}). Con webhook vero useresti lead-inbound + WEBHOOK_SECRET.`,
    )
  }

  return (
    <section className="space-y-4 p-5 pb-24">
      <h1 className="text-2xl font-semibold">Ingresso lead (mock)</h1>
      <form className="space-y-3" onSubmit={onSubmit}>
        <label className="block text-sm">
          Messaggio
          <Input className="mt-1" value={message} onChange={(e) => setMessage(e.target.value)} />
        </label>
        <Button type="submit">Qualifica finta</Button>
      </form>
      {result && <p className="text-sm">{result}</p>}
    </section>
  )
}
