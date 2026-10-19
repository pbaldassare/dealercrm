# CLAUDE.md — Istruzioni per Cursor / agenti AI

Leggi `docs/SPEC.md` per intero prima di scrivere codice: è l'unica fonte per obiettivo, regole, modello dati, logiche, schermate, dati demo e ordine di lavoro (sezioni 1-13).

## Stato del repository

- `supabase/migrations/` — lo schema `etidealcrm` **già applicato** al progetto Supabase `moyfkdwsghidkcifesrg` (esportato dalla tabella delle migrazioni). Non riapplicarlo: le nuove modifiche al database sono nuove migrazioni, mai modifiche a questi file.
- `supabase/functions/` — le Edge Functions già deployate: `lead-inbound`, `ai-result`, `process-timers`, `outbox-worker`, `generate-contract` (versione minima, da completare) e `fic-oauth`, `fic-invoice`, `fic-webhook` (Fatture in Cloud).
- `prototype/index.html` — pagina di prova a file singolo con la grafica di riferimento (crema caldo, teal, Quicksand + Baloo 2, angoli morbidi, menu a pillole). Serve come riferimento visivo e di flusso: **non è l'app**.
- `docs/ENV.md` — variabili e segreti, con quelli mancanti.
- `src/` — l'app React (Vite + TypeScript + Tailwind + React Router + TanStack Query), PWA installabile. **Fatte le fasi 0 e 1**: login e-mail/password, profilo e ruolo da `etidealcrm.profile`, registrazione del dispositivo con `install_id` (header `x-device-id` su ogni chiamata) e schermata "In attesa di approvazione", menu per ruolo, schermate Oggi, Lead (elenco e scheda con cambio stato via `change_lead_status`), Auto (ricerca per targa, scheda), Parametri (interruttori IA, timer, pesi, integrazioni, storico) e Dispositivi (approva/revoca, solo admin). Pratiche e Piazzale sono segnaposto.
- **Prossime fasi** (sezione 11 della specifica): 2 veicoli completi (foto, check condizioni, lavorazioni, import Excel), 3 lead complete (notifiche, riassegnazione, appuntamenti), 4 pratiche e margine, 5 piazzale con Google Maps, 6 report, 7 collegamenti veri. Il secondo fattore (TOTP) non è ancora attivo: aggiungerlo con Supabase Auth MFA nella fase 1 bis.

## Regole fisse

- Schema applicativo `etidealcrm`, sempre qualificato; il progetto Supabase ospita altri schemi (`etideal`, `public`, `tf_*`): non toccarli.
- Ogni nuova tabella: `GRANT` a `authenticated`, `GRANT ALL` a `service_role`, RLS attiva, policy. Vedi le migrazioni esistenti come modello.
- Nessuna chiave `service_role` nel browser. I costi (`purchase_cost`, `reconditioning`, `deal_item`) non sono leggibili dai ruoli `salesperson`, `reconditioning`, `yard`, `marketing`.
- I cambi di stato passano solo da `change_lead_status()` e `change_vehicle_status()`.
- Valori modificabili (timer, pesi, fasce, interruttori IA, Fatture in Cloud, mappa) in `setting`, mai nel codice.
- Integrazioni esterne dietro adattatori con mock e interruttore `FEATURE_*_REAL`.
- Interfaccia in italiano, codice e nomi in inglese. Mobile first (360-430 px).
- Grafica: i token sono in `src/index.css` (variabili HSL) e `tailwind.config.ts`; componenti base in `src/components/ui/`. Non usare colori letterali nei componenti.
- Letture dal client: i venditori leggono `vehicle_public` (senza costi), non `vehicle`; i costi solo da `vehicle_stock` per i ruoli abilitati. Niente embed PostgREST su viste: letture separate.
- Variabili: copiare `.env.example` in `.env`; il file `.env` non si committa.

## Comandi previsti

```sh
npm i
npm run dev
npm run build
supabase db push            # solo per nuove migrazioni
supabase functions deploy   # solo per funzioni cambiate
```
