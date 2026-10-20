# CLAUDE.md — Istruzioni per Cursor / agenti AI

Leggi `docs/SPEC.md` per intero prima di scrivere codice: è l'unica fonte per obiettivo, regole, modello dati, logiche, schermate, dati demo e ordine di lavoro (sezioni 1-13). Le scelte prese dove la specifica lasciava spazio sono in `docs/DECISIONS.md`.

## Stato del repository

- `supabase/migrations/` — due file già applicati al progetto Supabase `moyfkdwsghidkcifesrg`: `..._dealercrm_schema.sql` (tutto lo schema `dealercrm`: tabelle, funzioni, viste, RLS, permessi, storage, cron) e `..._dealercrm_demo.sql` (dati demo). Non modificarli: ogni cambiamento al database è una migrazione nuova.
- `supabase/functions/` — Edge Functions: `lead-inbound` e `ai-result` (webhook con firma HMAC), `process-timers` e `outbox-worker` (solo sistema), `generate-contract` (bozza HTML), `fic-oauth`, `fic-invoice`, `fic-webhook` (Fatture in Cloud), `manage-user` (solo admin). Il codice comune (client, controllo del ruolo e del dispositivo, firma dei webhook, qualifica finta) è in `_shared/`.
- `prototype/index.html` — pagina di prova a file singolo con la grafica di riferimento (crema caldo, teal, Quicksand + Baloo 2, angoli morbidi, menu a pillole). Serve come riferimento visivo e di flusso: **non è l'app**.
- `docs/ENV.md` — variabili e segreti, con quelli mancanti.
- `src/` — l'app React (Vite + TypeScript + Tailwind + React Router + TanStack Query), PWA installabile. Fatto: login, profilo e ruolo, registrazione del dispositivo con `register_device` e schermata "In attesa di approvazione", menu per ruolo, Oggi, Lead (cambio stato con `change_lead_status`), Auto, Parametri, Dispositivi, Pratiche (avanzamento con `set_deal_status`, contratto con `generate-contract`, fattura con `fic-invoice`), Report, Import Excel, Utenti (`manage-user`), Piazzale a griglia (`set_vehicle_yard_position`).
- **Manca ancora**: foto e check delle condizioni dal telefono, lavorazioni, appuntamenti e notifiche in app, riassegnazione manuale dall'app (la funzione `assign_lead` c'è), mappa Google sul piazzale, contratto in PDF con il modello definitivo, riepiloghi via notifica, collegamenti veri (portali, GHL, Fatture in Cloud con credenziali), secondo fattore (TOTP con Supabase Auth MFA), test.

## Regole fisse

- Schema applicativo `dealercrm`, sempre qualificato; il progetto Supabase ospita altri schemi (`etideal`, `public`, `tf_*`): non toccarli.
- Ogni nuova tabella: RLS attiva, policy, `GRANT` ad `authenticated` (solo le operazioni che servono), `GRANT ALL` a `service_role`. Mai nulla ad `anon`.
- Ogni nuova funzione: `SECURITY DEFINER SET search_path = dealercrm, pg_temp`, controllo del ruolo all'interno se è chiamabile dall'app, poi `REVOKE ALL ... FROM PUBLIC, anon, authenticated` e `GRANT EXECUTE` solo a chi serve. Le funzioni con prefisso `_` sono interne (solo `service_role`).
- Ruolo e concessionario si leggono con `dealercrm.my_role()`, `dealercrm.my_dealership()`, `dealercrm.has_role(...)`: valgono solo con utente attivo e dispositivo approvato (header `x-device-id`).
- Gli stati cambiano solo da `change_lead_status()`, `change_vehicle_status()` e `set_deal_status()`: un trigger blocca ogni altro `UPDATE` di `status`.
- Nessuna chiave `service_role` nel browser. I costi (`purchase_cost`, lavorazioni, `deal_item`) non sono leggibili dai ruoli `salesperson`, `reconditioning`, `yard`, `marketing`.
- Le viste sono di sola lettura per `authenticated` (una vista semplice sarebbe aggiornabile scavalcando la RLS).
- Valori modificabili (timer, pesi, fasce, interruttori IA, Fatture in Cloud, mappa) in `setting`, mai nel codice.
- Integrazioni esterne dietro adattatori con mock e interruttore `FEATURE_*_REAL`.
- Interfaccia in italiano, codice e nomi in inglese. Mobile first (360-430 px).
- Grafica: i token sono in `src/index.css` (variabili HSL) e `tailwind.config.ts`; componenti base in `src/components/ui/`. Non usare colori letterali nei componenti.
- Letture dal client: i venditori leggono `vehicle_public` (senza costi), non `vehicle`; i costi solo da `vehicle_stock` per i ruoli abilitati. Niente embed PostgREST su viste: letture separate.
- Edge Functions chiamate dall'app: `callFunction()` in `src/lib/supabase.ts` (mostra l'errore del server).
- Variabili: copiare `.env.example` in `.env`; il file `.env` non si committa.

## Comandi previsti

```sh
npm i
npm run dev
npm run build
supabase db push            # solo per nuove migrazioni
supabase functions deploy   # solo per funzioni cambiate
```
