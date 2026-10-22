import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { LoginPage } from './features/auth/LoginPage'
import { DevicesPage } from './features/devices/DevicesPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { AppShell } from './features/shell/AppShell'
import { TodayPage } from './features/today/TodayPage'
import { VehiclesPage } from './features/vehicles/VehiclesPage'
import { VehicleDetailPage } from './features/vehicles/VehicleDetailPage'
import { ImportPage } from './features/import/ImportPage'
import { LeadsPage } from './features/leads/LeadsPage'
import { LeadDetailPage } from './features/leads/LeadDetailPage'
import { LeadInboundPage } from './features/leads/LeadInboundPage'
import { DealsPage } from './features/deals/DealsPage'
import { DealDetailPage } from './features/deals/DealDetailPage'
import { YardPage } from './features/yard/YardPage'
import { ReportsPage } from './features/reports/ReportsPage'
import { SuppliersPage } from './features/suppliers/SuppliersPage'
import { ConditionsPage } from './features/vehicles/ConditionsPage'
import { SessionProvider, useSession } from './lib/session'

const queryClient = new QueryClient()

function Gate() {
  const { session, profile, loading, error } = useSession()

  if (loading) {
    return <p className="p-8 text-center text-[#5c6578]">Caricamento…</p>
  }
  if (!session) return <LoginPage />
  if (error) {
    return (
      <main className="mx-auto max-w-[430px] p-5">
        <p className="text-sm text-[#9b1c1c]">{error}</p>
      </main>
    )
  }
  if (!profile) {
    return (
      <main className="mx-auto max-w-[430px] p-5">
        <h1 className="text-2xl font-semibold">Profilo mancante</h1>
        <p className="mt-2 text-[15px] text-[#5c6578]">
          L’account Auth esiste, ma non c’è una riga in etidealcrm.profile. Gli utenti demo non
          sono stati creati su questo progetto condiviso.
        </p>
      </main>
    )
  }
  if (!profile.is_active) {
    return <p className="p-8 text-center">Utente non attivo.</p>
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/oggi" element={<TodayPage />} />
        <Route path="/lead" element={<LeadsPage />} />
        <Route path="/lead/:id" element={<LeadDetailPage />} />
        <Route path="/lead-inbound" element={<LeadInboundPage />} />
        <Route path="/pratiche" element={<DealsPage />} />
        <Route path="/pratiche/:id" element={<DealDetailPage />} />
        <Route path="/piazzale" element={<YardPage />} />
        <Route path="/report" element={<ReportsPage />} />
        <Route path="/auto" element={<VehiclesPage />} />
        <Route path="/auto/:id" element={<VehicleDetailPage />} />
        <Route path="/condizioni" element={<ConditionsPage />} />
        <Route path="/fornitori" element={<SuppliersPage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/parametri" element={<SettingsPage />} />
        <Route path="/dispositivi" element={<DevicesPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/oggi" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <BrowserRouter>
          <Gate />
        </BrowserRouter>
      </SessionProvider>
    </QueryClientProvider>
  )
}
