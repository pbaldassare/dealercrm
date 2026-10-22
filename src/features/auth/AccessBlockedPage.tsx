import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

/** Profilo mancante o utente disattivato. Nessun flusso sui dispositivi. */
export function AccessBlockedPage() {
  const { profile, signOut } = useAuth();
  const inactive = profile && !profile.is_active;

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-10">
      <div className="card w-full max-w-sm p-6 text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
          <ShieldAlert className="h-7 w-7" />
        </div>
        {!profile ? (
          <>
            <h1 className="text-xl">Profilo non trovato</h1>
            <p className="mt-2 text-sm text-muted-foreground">Il tuo utente esiste ma non è collegato a un concessionario. Chiedi all&apos;amministratore di creare il profilo.</p>
          </>
        ) : inactive ? (
          <>
            <h1 className="text-xl">Utente disattivato</h1>
            <p className="mt-2 text-sm text-muted-foreground">L&apos;accesso per {profile.full_name} è stato disattivato.</p>
          </>
        ) : (
          <>
            <h1 className="text-xl">Accesso non disponibile</h1>
            <p className="mt-2 text-sm text-muted-foreground">Non è possibile aprire l&apos;applicazione con questo account.</p>
          </>
        )}
        <div className="mt-6 flex flex-col gap-2">
          <Button variant="ghost" onClick={signOut}>Esci</Button>
        </div>
      </div>
    </div>
  );
}
