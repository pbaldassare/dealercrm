# Dealer CRM — gestionale per concessionario auto

Gestionale mobile-first per un concessionario di auto usate: lead da più canali qualificate da un assistente IA, assegnazione ai venditori con timer, CRM, stock veicoli con check delle condizioni, pratica con margine a voci, contratto di vendita, pubblicazione sui portali, piazzale su Google Maps, fatturazione con Fatture in Cloud.

- Specifica completa: [`docs/SPEC.md`](docs/SPEC.md)
- Scelte fatte dove la specifica lasciava spazio: [`docs/DECISIONS.md`](docs/DECISIONS.md)
- Variabili e segreti: [`docs/ENV.md`](docs/ENV.md)
- Istruzioni per gli agenti di sviluppo: [`CLAUDE.md`](CLAUDE.md)

## Struttura

```text
src/                  app React (PWA)
docs/                 specifica, decisioni e variabili
prototype/index.html  prototipo a file singolo (riferimento grafico e di flusso)
supabase/migrations/  schema dealercrm (un file) e dati demo (un file)
supabase/functions/   Edge Functions (Deno); _shared/ contiene il codice comune
supabase/config.toml  schemi esposti e verify_jwt per funzione
```

## Backend

Progetto Supabase `moyfkdwsghidkcifesrg` (eu-central-1), schema `dealercrm`. Lavori pianificati con `pg_cron` ogni minuto: `dealercrm.process_lead_timers()` e `dealercrm.process_outbox()`.

## Avvio

```sh
cp .env.example .env   # inserire VITE_SUPABASE_ANON_KEY
npm i
npm run dev            # http://localhost:8080
```

## Stato

Backend, sicurezza e dati demo pronti. App React: accessi e dispositivi, Oggi, Lead, Auto, Pratiche, Report, Import Excel, Utenti, Piazzale su mappa satellitare (o griglia), Parametri. Da fare: foto e check condizioni, appuntamenti e notifiche in app, contratto in PDF, collegamenti veri.
