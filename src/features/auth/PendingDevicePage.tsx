import { ShieldAlert, Smartphone } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

/** Mostrata dopo il login finché il dispositivo non è approvato (o se l'utente è disattivato). */
export function PendingDevicePage() {
  const { profile, device, signOut, refreshDevice } = useAuth();
  const inactive = profile && !profile.is_active;
  const revoked = device?.status === "revoked";

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-10">
      <div className="card w-full max-w-sm p-6 text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
          {inactive || revoked ? <ShieldAlert className="h-7 w-7" /> : <Smartphone className="h-7 w-7" />}
        </div>
        {!profile ? (
          <>
            <h1 className="text-xl">Profilo non trovato</h1>
            <p className="mt-2 text-sm text-muted-foreground">Il tuo utente esiste ma non è collegato a un concessionario. Chiedi all'amministratore di creare il profilo.</p>
          </>
        ) : inactive ? (
          <>
            <h1 className="text-xl">Utente disattivato</h1>
            <p className="mt-2 text-sm text-muted-foreground">L'accesso per {profile.full_name} è stato disattivato.</p>
          </>
        ) : revoked ? (
          <>
            <h1 className="text-xl">Dispositivo revocato</h1>
            <p className="mt-2 text-sm text-muted-foreground">Questo dispositivo non è più autorizzato. Chiedi all'amministratore di riabilitarlo.</p>
          </>
        ) : (
          <>
            <h1 className="text-xl">In attesa di approvazione</h1>
            <p className="mt-2 text-sm text-muted-foreground">Ciao {profile.full_name.split(" ")[0]}: questo dispositivo ({device?.name ?? "nuovo"}) è stato registrato. L'amministratore deve approvarlo dalla schermata Dispositivi. La pagina si aggiorna da sola.</p>
          </>
        )}
        <div className="mt-6 flex flex-col gap-2">
          {!inactive && <Button variant="outline" onClick={refreshDevice}>Controlla di nuovo</Button>}
          <Button variant="ghost" onClick={signOut}>Esci</Button>
        </div>
      </div>
    </div>
  );
}
