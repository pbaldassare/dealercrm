import { useSession } from '../../lib/session'

export function DevicesPage() {
  const { profile } = useSession()

  if (profile?.role !== 'admin') {
    return <p className="p-5 text-sm text-[#5c6578]">Solo l’amministratore gestisce i dispositivi.</p>
  }

  return (
    <section className="space-y-4 p-5">
      <h1 className="text-2xl font-semibold">Dispositivi</h1>
      <p className="rounded-xl bg-[#fde8d8] p-3 text-sm">
        Il vincolo sui dispositivi è spento. Non serve approvare gli install: dopo il login si
        entra nell’app. La tabella device resta per quando Paolo lo riaccende.
      </p>
    </section>
  )
}
