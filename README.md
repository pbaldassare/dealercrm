# EtiDeal gestionale

PWA per un concessionario di auto **nuove, km0 e usate**. I dati stanno nello schema Postgres `etidealcrm` sul progetto Supabase `moyfkdwsghidkcifesrg`. Gli schemi `public` e `etideal` non vengono toccati.

## Avvio

```bash
cp .env.example .env.local
# imposta VITE_SUPABASE_ANON_KEY (chiave publishable del progetto)
npm install
npm run dev -- --host --port 43123
```

Interfaccia in italiano. Nomi di tabelle e colonne in inglese. Nessuna chiave `service_role` nel browser.

Accesso demo: `admin.demo@demo.test` / password in `docs/ENV.md`. Gli altri account sono `*@demo.test` (Auth condivisa: non usare altre caselle). Il vincolo sui dispositivi autorizzati è spento: dopo il login si entra senza schermata di approvazione.

## Database

Migrazioni in `supabase/migrations/`. RLS su ogni tabella; `anon` senza DML. Bucket privati: `vehicle-photos`, `documents`, `imports`, `call-audio`.

## Test

```bash
npm test
npm run lint
```

Coperti: transizioni lead, timer, assegnazione, margine, targa.

## Documentazione

- `docs/ENV.md`
- `docs/DECISIONS.md`
