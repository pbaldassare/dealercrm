import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { supabase, supabaseConfigured } from '../../lib/supabase'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setMessage(null)

    if (!supabaseConfigured) {
      setError('Collegamento a Supabase non configurato. Imposta VITE_SUPABASE_ANON_KEY.')
      return
    }

    setPending(true)
    const { data, error: signError } = await supabase.auth.signInWithPassword({ email, password })
    setPending(false)

    if (signError) {
      setError(
        signError.message === 'Invalid login credentials'
          ? 'E-mail o password non corretti.'
          : 'Accesso non riuscito. Riprova.',
      )
      return
    }

    setMessage(
      data.session
        ? 'Accesso riuscito.'
        : 'Controlla la posta per confermare l’accesso.',
    )
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col justify-center px-5 py-8">
      <p className="text-sm font-medium uppercase tracking-[0.16em] text-[#c45c26]">EtiDeal</p>
      <h1 className="mt-2 text-3xl font-semibold leading-tight">Gestionale concessionario</h1>
      <p className="mt-2 text-[15px] text-[#5c6578]">
        Auto nuove, km0 e usate. Accedi con e-mail e password. Il secondo fattore si attiva
        dall’account quando è disponibile. Demo: admin.demo@demo.test (password in docs/ENV.md).
      </p>

      {!supabaseConfigured && (
        <p className="mt-4 rounded-xl bg-[#fde8d8] px-3 py-2 text-sm">
          Anteprima senza chiavi: la schermata di accesso è visibile, ma il login resta disattivato
          finché non imposti le variabili in <code>.env.local</code>.
        </p>
      )}

      <form className="mt-8 space-y-4" onSubmit={onSubmit}>
        <label className="block text-sm font-medium">
          E-mail
          <Input
            className="mt-1"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="block text-sm font-medium">
          Password
          <Input
            className="mt-1"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="text-sm text-[#9b1c1c]">{error}</p>}
        {message && <p className="text-sm text-[#1f7a4d]">{message}</p>}
        <Button type="submit" disabled={pending}>
          {pending ? 'Accesso…' : 'Accedi'}
        </Button>
      </form>
    </main>
  )
}
