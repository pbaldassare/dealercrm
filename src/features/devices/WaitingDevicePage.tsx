import { Button } from '../../components/ui/button'
import { useSession } from '../../lib/session'

export function WaitingDevicePage() {
  const { device, refresh, signOut } = useSession()

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col justify-center px-5 py-8">
      <h1 className="text-2xl font-semibold">In attesa di approvazione</h1>
      <p className="mt-2 text-[15px] text-[#5c6578]">
        Questo dispositivo è registrato come {device?.status ?? 'pending'}. Un amministratore deve
        autorizzarlo dalla schermata Dispositivi. Finché non è autorizzato non vedi i dati.
      </p>
      <div className="mt-6 space-y-3">
        <Button type="button" onClick={() => void refresh()}>
          Controlla di nuovo
        </Button>
        <Button type="button" variant="ghost" onClick={() => void signOut()}>
          Esci
        </Button>
      </div>
    </main>
  )
}
