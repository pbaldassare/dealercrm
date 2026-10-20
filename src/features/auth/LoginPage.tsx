import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { Car } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { supabaseConfigured } from "@/lib/supabase";

export function LoginPage() {
  const { session, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const err = await signIn(email.trim(), password);
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-10">
      <div className="card w-full max-w-sm p-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-primary text-white shadow-glow"><Car className="h-6 w-6" /></div>
          <div><h1 className="text-2xl">Dealer CRM</h1><p className="text-sm text-muted-foreground">Accesso riservato al personale</p></div>
        </div>
        {!supabaseConfigured && (
          <p className="mb-4 rounded-xl bg-warning/15 p-3 text-sm text-warning-ink">Manca la configurazione: copia <code>.env.example</code> in <code>.env</code> e inserisci la chiave di Supabase.</p>
        )}
        <form onSubmit={submit} className="space-y-4">
          <div><Label htmlFor="email">E-mail</Label><Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><Label htmlFor="password">Password</Label><Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          {error && <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive-ink">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>{busy ? "Accesso in corso…" : "Entra"}</Button>
        </form>
        <p className="mt-5 text-xs text-muted-foreground">Il primo accesso da un nuovo telefono o computer resta in attesa finché l'amministratore non approva il dispositivo.</p>
      </div>
    </div>
  );
}
