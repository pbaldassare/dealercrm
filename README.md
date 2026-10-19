# Etideal CRM — gestionale per concessionario auto

Gestionale mobile-first per un concessionario di auto usate: lead da più canali qualificate da un assistente IA, assegnazione ai venditori con timer, CRM, stock veicoli con check delle condizioni, pratica con margine a voci, contratto di vendita, pubblicazione sui portali, piazzale su Google Maps, fatturazione con Fatture in Cloud.

- Specifica completa: [`docs/SPEC.md`](docs/SPEC.md)
- Variabili e segreti: [`docs/ENV.md`](docs/ENV.md)
- Istruzioni per gli agenti di sviluppo: [`CLAUDE.md`](CLAUDE.md)

## Struttura

```text
docs/                 specifica e variabili
prototype/index.html  prototipo a file singolo (riferimento grafico e di flusso)
supabase/migrations/  schema etidealcrm, già applicato al progetto
supabase/functions/   Edge Functions (Deno), già deployate
supabase/config.toml  schemi esposti e verify_jwt per funzione
```

## Backend

Progetto Supabase `moyfkdwsghidkcifesrg` (eu-central-1), schema `etidealcrm`. Lavori pianificati con `pg_cron` ogni minuto: `process_lead_timers()` e `process_outbox()`.

## Stato

Backend e dati demo pronti. Frontend React (PWA) da costruire seguendo la sezione 11 della specifica, una fase alla volta.
