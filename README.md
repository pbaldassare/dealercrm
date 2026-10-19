# Etideal CRM — gestionale per concessionario auto

Gestionale mobile-first per un concessionario di auto usate: lead da più canali qualificate da un assistente IA, assegnazione ai venditori con timer, CRM, stock veicoli con check delle condizioni, pratica con margine a voci, contratto di vendita, pubblicazione sui portali, piazzale su Google Maps, fatturazione con Fatture in Cloud.

- Specifica completa: [`docs/SPEC.md`](docs/SPEC.md)
- Variabili e segreti: [`docs/ENV.md`](docs/ENV.md)
- Istruzioni per gli agenti di sviluppo: [`CLAUDE.md`](CLAUDE.md)

## Struttura

```text
src/                  app React (PWA)
docs/                 specifica e variabili
prototype/index.html  prototipo a file singolo (riferimento grafico e di flusso)
supabase/migrations/  schema etidealcrm, già applicato al progetto
supabase/functions/   Edge Functions (Deno), già deployate
supabase/config.toml  schemi esposti e verify_jwt per funzione
```

## Backend

Progetto Supabase `moyfkdwsghidkcifesrg` (eu-central-1), schema `etidealcrm`. Lavori pianificati con `pg_cron` ogni minuto: `process_lead_timers()` e `process_outbox()`.

## Avvio

```sh
cp .env.example .env   # inserire VITE_SUPABASE_ANON_KEY
npm i
npm run dev            # http://localhost:8080
```

## Stato

Backend e dati demo pronti. App React: accessi e dispositivi, Oggi, Lead, Auto, Pratiche, Report, Import Excel, Utenti, Piazzale a griglia, Parametri. Da fare: foto e check condizioni, appuntamenti e notifiche, mappa Google, collegamenti veri.
