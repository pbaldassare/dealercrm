import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { Shell } from "@/components/Shell";
import { LoginPage } from "@/features/auth/LoginPage";
import { PendingDevicePage } from "@/features/auth/PendingDevicePage";
import { TodayPage } from "@/features/today/TodayPage";
import { LeadsPage } from "@/features/leads/LeadsPage";
import { LeadDetailPage } from "@/features/leads/LeadDetailPage";
import { VehicleDetailPage, VehiclesPage } from "@/features/vehicles/VehiclesPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { DevicesPage } from "@/features/devices/DevicesPage";
import { DealsPage } from "@/features/deals/DealsPage";
import { DealDetailPage } from "@/features/deals/DealDetailPage";
import { NewDealPage } from "@/features/deals/NewDealPage";
import { ReportsPage } from "@/features/reports/ReportsPage";
import { YardPage } from "@/features/yard/YardPage";
import { UsersPage } from "@/features/users/UsersPage";
import { ImportPage } from "@/features/import/ImportPage";
import { NewLeadPage } from "@/features/leads/NewLeadPage";
import { VehicleFormPage } from "@/features/vehicles/VehicleFormPage";
import { CustomerDetailPage, CustomersPage } from "@/features/customers/CustomersPage";
import { SupplierDetailPage, SuppliersPage } from "@/features/suppliers/SuppliersPage";
import { ListingsPage } from "@/features/listings/ListingsPage";
import { NotificationsPage } from "@/features/notifications/NotificationsPage";

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } });

function Protected() {
  const { loading, session, ready } = useAuth();
  if (loading) return <div className="grid min-h-[100dvh] place-items-center text-sm text-muted-foreground">Carico…</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (!ready) return <PendingDevicePage />;
  return <Shell />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<Protected />}>
              <Route index element={<TodayPage />} />
              <Route path="lead" element={<LeadsPage />} />
              <Route path="lead/nuova" element={<NewLeadPage />} />
              <Route path="lead/:id" element={<LeadDetailPage />} />
              <Route path="clienti" element={<CustomersPage />} />
              <Route path="clienti/:id" element={<CustomerDetailPage />} />
              <Route path="auto" element={<VehiclesPage />} />
              <Route path="auto/nuova" element={<VehicleFormPage />} />
              <Route path="auto/:id" element={<VehicleDetailPage />} />
              <Route path="auto/:id/modifica" element={<VehicleFormPage />} />
              <Route path="fornitori" element={<SuppliersPage />} />
              <Route path="fornitori/:id" element={<SupplierDetailPage />} />
              <Route path="annunci" element={<ListingsPage />} />
              <Route path="notifiche" element={<NotificationsPage />} />
              <Route path="pratiche" element={<DealsPage />} />
              <Route path="pratiche/nuova" element={<NewDealPage />} />
              <Route path="pratiche/:id" element={<DealDetailPage />} />
              <Route path="piazzale" element={<YardPage />} />
              <Route path="report" element={<ReportsPage />} />
              <Route path="import" element={<ImportPage />} />
              <Route path="utenti" element={<UsersPage />} />
              <Route path="parametri" element={<SettingsPage />} />
              <Route path="dispositivi" element={<DevicesPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster position="top-center" richColors />
      </AuthProvider>
    </QueryClientProvider>
  );
}
