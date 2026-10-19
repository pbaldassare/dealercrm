# CLAUDE.md — Istruzioni per Cursor / agenti AI

Leggi `docs/SPEC.md` per intero prima di scrivere codice: è l'unica fonte per obiettivo, regole, modello dati, logiche, schermate, dati demo e ordine di lavoro (sezioni 1-13).

## Stato del repository

- `supabase/migrations/` — lo schema `etidealcrm` **già applicato** al progetto Supabase `moyfkdwsghidkcifesrg` (esportato dalla tabella delle migrazioni). Non riapplicarlo: le nuove modifiche al database sono nuove migrazioni, mai modifiche a questi file.
- `supabase/functions/` — le Edge Functions già deployate: `lead-inbound`, `ai-result`, `process-timers`, `outbox-worker`, `generate-contract` (versione minima, da completare) e `fic-oauth`, `fic-invoice`, `fic-webhook` (Fatture in Cloud).
- `prototype/index.html` — pagina di prova a file singolo con la grafica di riferimento (crema caldo, teal, Quicksand + Baloo 2, angoli morbidi, menu a pillole). Serve come riferimento visivo e di flusso: **non è l'app**.
- `docs/ENV.md` — variabili e segreti, con quelli mancanti.
- L'app React (fasi 0-7 della specifica) **non esiste ancora**: va costruita in questa repo con la struttura indicata nella sezione 2 della specifica.

## Regole fisse

- Schema applicativo `etidealcrm`, sempre qualificato; il progetto Supabase ospita altri schemi (`etideal`, `public`, `tf_*`): non toccarli.
- Ogni nuova tabella: `GRANT` a `authenticated`, `GRANT ALL` a `service_role`, RLS attiva, policy. Vedi le migrazioni esistenti come modello.
- Nessuna chiave `service_role` nel browser. I costi (`purchase_cost`, `reconditioning`, `deal_item`) non sono leggibili dai ruoli `salesperson`, `reconditioning`, `yard`, `marketing`.
- I cambi di stato passano solo da `change_lead_status()` e `change_vehicle_status()`.
- Valori modificabili (timer, pesi, fasce, interruttori IA, Fatture in Cloud, mappa) in `setting`, mai nel codice.
- Integrazioni esterne dietro adattatori con mock e interruttore `FEATURE_*_REAL`.
- Interfaccia in italiano, codice e nomi in inglese. Mobile first (360-430 px).
- Grafica: riprendere i token del prototipo (`prototype/index.html`, blocco `:root`) in `src/index.css` come variabili HSL per Tailwind.

## Comandi previsti

```sh
npm i
npm run dev
npm run build
supabase db push            # solo per nuove migrazioni
supabase functions deploy   # solo per funzioni cambiate
```
