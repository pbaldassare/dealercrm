# Specifica per Cursor - gestionale concessionario

Oct 19, 2026 · @paolo

Questo documento è l'unica fonte per costruire il gestionale: contiene obiettivo, regole, modello dati, logiche, schermate, dati demo e ordine di lavoro. Leggilo tutto prima di scrivere codice.

## 1. Istruzioni per Cursor

**Obiettivo.** Costruire una web app installabile (PWA), pensata prima di tutto per il telefono, che gestisce un concessionario di auto usate: lead da più canali con un'IA che le qualifica, assegnazione ai venditori, CRM, stock veicoli, controllo delle condizioni, pratica con margine a voci, contratto di vendita, pubblicazione sui portali e mappa del piazzale. Interfaccia in italiano.

**Contesto.** Un solo concessionario per ora, con 7 venditori e una persona per ogni altra figura. Ogni tabella principale ha comunque `dealership_id`, per non dover rifare il modello dopo.

**Ambiente.** La repo GitHub e il progetto Supabase sono già collegati. Se nella repo c'è già uno stack, seguilo; altrimenti usa quello della sezione 2.

**Regole di lavoro**

- Ogni modifica al database è una migrazione in `supabase/migrations`, mai una modifica a mano.
- Lavora per fasi (sezione 11): un branch e una pull request per fase, commit piccoli e chiari.
- Row Level Security attiva su tutte le tabelle. Nessuna chiave `service_role` nel codice del browser.
- Ogni integrazione esterna (portali, WhatsApp, voce, Google Maps) passa da un adattatore con implementazione finta (mock) e interruttore: all'inizio funziona tutto con i mock, i collegamenti veri si accendono dopo.
- Non inventare chiavi o credenziali: leggi le variabili d'ambiente (sezione 2) e documenta quelle mancanti in `docs/ENV.md`.
- Nomi di tabelle, colonne e codice in inglese; testi dell'interfaccia in italiano.
- Tutti i dati di prova hanno `is_demo = true`, così si cancellano in un colpo solo.
- Scrivi test per: transizioni di stato dei lead, timer, assegnazione, calcolo del margine, normalizzazione della targa.
- Dove qualcosa è ambiguo, scegli il valore predefinito indicato qui e annotalo in `docs/DECISIONS.md`.
- I valori predefiniti (timer, pesi, fasce) stanno nella tabella `setting` e si modificano dall'app: non scriverli nel codice.

**Cosa non fare ora:** non collegare servizi veri a pagamento, non registrare chiamate, non inviare messaggi veri ai clienti.

## 2. Stack, struttura e variabili

**Stack predefinito** (se la repo non ne ha uno)

| Livello | Scelta |
| --- | --- |
| Frontend | React, TypeScript, Vite, Tailwind, shadcn/ui, React Router, TanStack Query, react-hook-form con zod |
| PWA | installabile, icone, schermata di avvio, `vite-plugin-pwa`; layout di base a 360-430 px di larghezza |
| Database e autenticazione | Supabase: Postgres, Auth, Storage, Realtime |
| Logica lato server | Supabase Edge Functions (Deno) e funzioni Postgres; lavori pianificati con `pg_cron` |
| Mappa | Google Maps JavaScript API, vista satellitare |
| Test | Vitest per la logica; Playwright per 3 percorsi principali |

**Struttura della repo**

```text
src/features/{auth,leads,vehicles,deals,suppliers,yard,reports,settings,devices,import}
src/lib/{supabase,format,plate,time}
src/integrations/{portals,messaging,voice,maps}   # adattatori + mock
supabase/migrations/
supabase/functions/{lead-inbound,ai-result,process-timers,outbox-worker,generate-contract}
supabase/seed.sql
docs/{ENV.md,DECISIONS.md}
templates/contratto-vendita.md
```

**Variabili d'ambiente** (lato browser solo quelle con prefisso `VITE_`)

| Variabile | Uso | Predefinito |
| --- | --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | client Supabase | dal progetto collegato |
| `SUPABASE_SERVICE_ROLE_KEY` | solo nelle Edge Functions | segreto |
| `VITE_GOOGLE_MAPS_API_KEY` | mappa del piazzale | vuota: mostra segnaposto |
| `FEATURE_PORTALS_REAL` | usa i connettori veri dei portali | false |
| `FEATURE_MESSAGING_REAL` | usa WhatsApp e voce veri | false |
| `AUTOSCOUT24_API_USER`, `AUTOSCOUT24_API_PASSWORD` | accesso API AutoScout24 | vuote |
| `GHL_API_KEY`, `GHL_LOCATION_ID` | GoHighLevel (messaggi, voce, social) | vuote |
| `WEBHOOK_SECRET` | firma dei webhook in ingresso | generata |

## 3. Ruoli, permessi e dispositivi

**Ruoli** (enum `app_role`): `admin`, `owner`, `sales_manager`, `salesperson`, `used_manager`, `reconditioning`, `yard`, `accounting`, `finance_insurance`, `marketing`. Ogni utente ha un solo ruolo, salvato in `profile.role`.

**Matrice dei permessi.** R = legge, W = legge e scrive, own = solo le proprie, — = nessun accesso.

| Ruolo | Lead | Veicoli | Costi e margine | Pratiche | Fornitori | Parametri | Piazzale | Report | Utenti e dispositivi |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| admin | W | W | W | W | W | W | W | R | W |
| owner | R | R | R | R | R | W (solo assegnazione e IA) | R | R | — |
| sales\_manager | W | R | R | W | R | W (timer, assegnazione, IA) | R | R | — |
| salesperson | W own | R | — | W own | — | — | R | R own | — |
| used\_manager | R | W | R | R | W | — | R | R | — |
| reconditioning | — | R + condizioni e lavorazioni W | — | — | — | — | R | — | — |
| yard | — | R + condizioni W | — | — | — | — | W | — | — |
| accounting | R | R | R | W | R | — | — | R | — |
| finance\_insurance | R | R | W (solo voci F&I) | W (voci F&I) | — | — | — | R | — |
| marketing | R (conteggi) | R + annunci W | — | — | — | — | — | R | — |

**Come implementarli**

- Funzioni Postgres di appoggio: app\_`current_role()` (da `profile`), `is_active_user()`, `is_device_authorized()`.
- Una policy RLS per tabella e per tipo di operazione, che combina ruolo e, dove serve, l'assegnazione (`lead.assigned_to = auth.uid()`).
- I costi (`purchase_cost`, `reconditioning_cost`, `deal_item`) non devono essere leggibili da `salesperson`, `reconditioning`, `yard` e `marketing`: esponi per loro una vista `vehicle_public` senza le colonne di costo.
- Un utente con `is_active = false` non accede a nulla.

**Dispositivi autorizzati.** L'indirizzo MAC non è leggibile da una web app: si usa un identificativo di installazione.

1. Al primo avvio l'app genera `install_id` (uuid casuale), lo salva in modo persistente e lo invia a ogni richiesta nell'intestazione `x-device-id`.
2. Dopo il login l'app registra il dispositivo in `device` con stato `pending`. Finché non è `authorized`, mostra solo la schermata "In attesa di approvazione".
3. L'amministratore approva o revoca dalla schermata Dispositivi. La revoca ha effetto subito.
4. `is_device_authorized()` legge `current_setting('request.headers')::json->>'x-device-id'` e controlla che il dispositivo sia `authorized` e appartenga all'utente. Le policy delle tabelle sensibili la richiedono.
5. Massimo 2 dispositivi autorizzati per utente (vincolo con trigger).
6. Accesso con e-mail e password più secondo fattore (TOTP di Supabase Auth, o passkey se disponibile).

Questo limita l'uso dell'app ai dispositivi approvati, ma non è una protezione assoluta: va scritto in `docs/DECISIONS.md`.

## 4. Modello dati

Identificatori in inglese. Ogni tabella ha `id uuid primary key default gen_random_uuid()`, `created_at timestamptz default now()` e, dove indicato, `dealership_id` e `is_demo boolean default false`. Tutte le date e ore sono `timestamptz`, il fuso del concessionario è Europe/Rome.

**Enum**

| Enum | Valori (etichetta italiana nell'app) |
| --- | --- |
| `app_role` | admin, owner, sales\_manager, salesperson, used\_manager, reconditioning, yard, accounting, finance\_insurance, marketing |
| `lead_channel` | autoscout24, other\_portal, website, whatsapp, voicemail, phone, facebook, instagram, walk\_in |
| `lead_status` | new, ai\_qualifying, qualified, assigned, contacted, appointment\_set, visited, proposal\_sent, negotiating, won, lost, invalid |
| `lead_temperature` | hot, warm, cold, invalid |
| `vehicle_status` | incoming, received, reconditioning, ready, published, reserved, sold, delivering, delivered, withdrawn |
| `yard_status` | in\_yard, workshop, test\_drive, off\_site |
| `vehicle_kind` | used, km0, new |
| `body_type` | city\_car, sedan, station\_wagon, suv, minivan, coupe, other |
| `supplier_type` | private, customer\_trade\_in, auction, dealer, import, rental\_company |
| `deal_status` | open, quote\_sent, contract\_pending, signed, payment\_pending, transfer\_documents, delivered, closed, cancelled |
| `deal_item_type` | vehicle\_margin, financing\_interest, insurance, cvt, gps, etching, extended\_warranty, fees, discount, salesperson\_commission, other\_cost |
| `deal_item_status` | planned, confirmed, collected |
| `condition_phase` | intake, during, delivery |
| `fuel_level` | empty, quarter, half, three\_quarters, full |
| `damage_type` | scratch, dent, break, wear |
| `severity` | light, medium, severe |
| `listing_status` | to\_publish, publishing, published, error, withdrawn, suspended |
| `device_status` | pending, authorized, revoked |
| `appointment_status` | scheduled, confirmed, done, no\_show, cancelled |
| `outbox_status` | pending, sent, failed |

**Utenti, parametri, fornitori**

```text
dealership(name, vat_number, address, timezone default 'Europe/Rome')
profile(id uuid pk references auth.users, dealership_id, full_name, role app_role, phone,
        is_active bool default true, is_available bool default true, last_seen_at)
device(user_id, install_id text unique, name, status device_status default 'pending',
       requested_at, authorized_by, authorized_at, revoked_at, last_seen_at)
       -- trigger: max 2 con status 'authorized' per user_id
setting(dealership_id, key text, value jsonb, updated_by, updated_at, unique(dealership_id,key))
setting_history(setting_id, old_value jsonb, new_value jsonb, changed_by, changed_at)
supplier(dealership_id, name, type supplier_type, vat_number, contacts jsonb, payment_terms,
         reliability smallint check (1..5), notes, is_demo)
```

**Veicoli**

```text
vehicle(dealership_id, plate text not null, vin, make, model, trim, kind vehicle_kind,
        body_type, first_registration date, mileage_km int, fuel_type, gearbox, power_kw int,
        color, emission_class, previous_owners smallint, supplier_id,
        purchase_cost numeric(12,2), list_price numeric(12,2), sale_price numeric(12,2),
        entry_date date, status vehicle_status default 'incoming', status_changed_at,
        yard_slot_id, yard_status, yard_verified_at, yard_verified_by, notes, is_demo,
        unique(dealership_id, plate))
        -- plate normalizzata: maiuscole, senza spazi, regex ^[A-Z]{2}[0-9]{3}[A-Z]{2}$
vehicle_event(vehicle_id, at, actor_id, type, from_status, to_status, payload jsonb)
vehicle_work(vehicle_id, kind (bodywork|mechanical|cleaning|documents), status, cost numeric,
             started_at, ended_at, notes)
             -- reconditioning_cost = somma dei cost (vista)
vehicle_condition(vehicle_id, phase condition_phase, taken_by, taken_at, fuel_level,
                  mileage_km int, keys_count smallint, documents jsonb,
                  warning_lights text[], tires jsonb, notes)
vehicle_damage(condition_id, zone text, damage_type, severity, notes, repaired bool default false)
vehicle_photo(vehicle_id, condition_id null, storage_path, kind, zone, taken_at)
listing(vehicle_id, portal text, status listing_status, external_id, last_synced_at, last_error,
        unique(vehicle_id, portal))
yard_zone(dealership_id, code, name, geometry jsonb)
yard_slot(zone_id, code, lat double precision, lng double precision, unique(zone_id, code))
```

**Clienti e lead**

```text
customer(dealership_id, first_name, last_name, phone, email, city, language default 'it',
         privacy_consent bool, marketing_consent bool, is_demo)
         -- deduplica su phone normalizzato (E.164) o email in minuscolo
lead(dealership_id, customer_id, channel lead_channel, source_ref text, vehicle_id null,
     interest_text, price_band char(1) check in ('A','B','C','D'), purchase_type (cash|financing|trade_in),
     urgency (low|medium|high), status lead_status default 'new', status_changed_at,
     status_deadline_at,                 -- scadenza del timer dello stato corrente
     temperature lead_temperature, ai_score smallint check (0..100), ai_intent, ai_summary,
     assigned_to uuid null references profile, assigned_at, assignment_reason jsonb,
     reassignment_count smallint default 0, first_contact_at, response_minutes int,
     last_contact_at, next_action, next_action_at, lost_reason, deal_id null, is_demo)
lead_event(lead_id, at, actor_id null, actor_kind (user|system|ai), type, from_status, to_status, payload jsonb)
conversation(lead_id, channel, direction (in|out), body, transcript, audio_path, is_ai bool,
             at, external_id)
appointment(lead_id, vehicle_id, salesperson_id, starts_at, status appointment_status)
```

**Pratiche, margine e contratto**

```text
deal(dealership_id, lead_id null, customer_id, vehicle_id, salesperson_id, status deal_status default 'open',
     sale_price numeric(12,2), deposit numeric(12,2), trade_in jsonb, financing jsonb,
     warranty_months smallint, conclusion_type (on_premises|distance|off_premises),
     signed_at, delivered_at, is_demo)
deal_item(deal_id, type deal_item_type, kind (revenue|cost), estimated numeric(12,2),
          actual numeric(12,2) null, status deal_item_status default 'planned', source text, date)
contract(deal_id, template_version, data jsonb, pdf_path, generated_at, signed_at)
```

**Operatività**

```text
import_job(kind (vehicles|leads|customers|suppliers), file_path, status, mapping jsonb,
           total int, valid int, skipped int, duplicates int, created_by)
import_row(job_id, row_no, raw jsonb, status, error)
outbox(integration text, action text, payload jsonb, status outbox_status default 'pending',
       attempts int default 0, next_attempt_at, last_error)
       -- tutte le azioni verso l'esterno passano da qui, con tentativi e attesa crescente
notification(user_id, type, payload jsonb, read_at)
```

**Viste** (per i report e per gli schermi): `vehicle_stock` (giorni in stock, costo di ricondizionamento), `vehicle_public` (senza costi), `deal_margin` (totali per pratica e per voce, stimato e reale), `lead_open` (con tempo residuo), `salesperson_stats` (lead ricevute, appuntamenti, chiusure, tasso, tempo di risposta, margine).

**Storage (bucket privati):** `dealercrm-photos`, `dealercrm-documents`, `dealercrm-imports`, `dealercrm-audio`. Le foto si caricano in modo ridimensionato dal telefono.

## 5. Logica dei lead

**Stati e transizioni.** Il cambio di stato passa solo da una funzione Postgres `change_lead_status(lead_id, to_status, payload)`, che controlla la transizione, scrive `lead_event`, aggiorna `status_changed_at` e calcola `status_deadline_at`. Nessun altro codice modifica `lead.status`.

| Stato | Timer massimo (predefinito) | Transizioni consentite | Alla scadenza |
| --- | --- | --- | --- |
| `new` | 2 min | ai\_qualifying, invalid | avviso al responsabile se l'IA è spenta |
| `ai_qualifying` | 10 min (voce), 24 ore (WhatsApp) | qualified, invalid | passaggio a un umano |
| `qualified` | 5 min | assigned | assegnazione automatica |
| `assigned` | 15 min in orario | contacted | 15': avviso al venditore; 30': avviso al responsabile; 60': riassegnazione |
| `contacted` | 2 giorni senza passi avanti | appointment\_set, lost | promemoria; al 3° tentativo senza risposta l'IA ricontatta |
| `appointment_set` | promemoria 24 e 2 ore prima | visited, lost, contacted (se no-show) | no-show: nuovo contatto entro 1 giorno |
| `visited` | 1 giorno | proposal\_sent, lost | avviso al venditore |
| `proposal_sent` | 3 giorni | negotiating, lost | avviso e ricontatto |
| `negotiating` | 7 giorni | won, lost | avviso al responsabile |
| `won` | nessuno | (finale) | crea la pratica |
| `lost` | nessuno | (finale) | richiede `lost_reason` |
| `invalid` | nessuno | (finale) | nessuna |

Motivi di perdita: `price_too_high`, `vehicle_sold`, `chose_competitor`, `no_response`, `financing_denied`, `trade_in_not_accepted`, `changed_mind`, `other`.

**Timer.** Il campo `status_deadline_at` conta solo le ore lavorative, lette da `setting.work_hours`. Un lavoro `pg_cron` ogni minuto chiama la funzione `process_lead_timers()` (o la Edge Function `process-timers`), che trova le lead con `status_deadline_at` scaduta, applica l'azione dalla tabella, scrive l'evento e crea le notifiche. Una lead aperta da più di 30 giorni senza attività passa a `lost` con `no_response`. Si possono riassegnare al massimo 3 volte; alla 3ª va al responsabile vendite.

**Tempo residuo nell'interfaccia:** conto alla rovescia verde, arancione quando resta meno del 25% del tempo, rosso se scaduto.

**Impostazioni predefinite** (riga `setting` con chiave `lead_timers`, modificabile dalla schermata Parametri):

```json
{
  "work_hours": {"mon-fri": ["09:00", "19:00"], "sat": ["09:00", "13:00"], "holidays": []},
  "timers_min": {"new": 2, "qualified": 5, "assigned": 15, "contacted": 2880, "visited": 1440,
                 "proposal_sent": 4320, "negotiating": 10080},
  "escalation_assigned_min": {"warn_salesperson": 15, "warn_manager": 30, "reassign": 60},
  "max_reassignments": 3,
  "auto_lose_days": 30
}
```

**Assegnazione** (funzione `assign_lead(lead_id)`, chiamata quando la lead passa a `qualified`, e per le riassegnazioni):

1. Calcola `price_band` dal valore del veicolo di interesse: A fino a 10.000, B da 10.000 a 20.000, C da 20.000 a 35.000, D oltre 35.000 euro (chiave `value_bands`).
2. Filtra i venditori: `is_active` e `is_available`, dentro l'orario o con reperibilità, abilitati alla fascia, con meno lead aperte del massimo (15). Fascia C: solo con tasso di chiusura sopra la mediana. Fascia D: i 3 con tasso più alto, con il responsabile in copia.
3. Continuità: se il cliente ha già una lead o pratica con un venditore idoneo, assegna a lui.
4. Punteggio per ciascun candidato: `0.40 × performance + 0.40 × rotazione + 0.20 × carico`, ognuno normalizzato 0-100. Performance = media pesata di tasso di chiusura a 90 giorni, tempo medio di risposta (più basso è meglio) e % di appuntamenti fissati. Rotazione = meno lead ricevute negli ultimi 30 giorni rispetto agli altri, più punti. Carico = lead aperte rispetto al massimo.
5. Vincoli di equità: quota minima garantita 8% delle lead per venditore nel periodo; nessuno può avere più del 25% delle lead calde.
6. Vince il punteggio più alto (a parità, chi ha ricevuto meno lead). Salva in `assignment_reason` i filtri applicati, i punteggi e la scelta.
7. Il responsabile può forzare l'assegnazione a mano; il motivo si registra.

Tutti i pesi, le soglie e le fasce stanno in `setting` (`assignment_weights`, `assignment_params`, `value_bands`) e si cambiano da telefono.

## 6. Logica di veicoli, condizioni, pratica e vendita

**Storico da targa.** La ricerca per targa (normalizzata) apre una scheda con la cronologia di `vehicle_event`, le lavorazioni, i check, le foto, le lead e la pratica collegate. Ogni cambio di stato del veicolo scrive un evento tramite funzione `change_vehicle_status()`.

**Stati del veicolo e allerte** (le soglie sono in `setting`, chiave `vehicle_alerts`)

| Stato | Allerta predefinita |
| --- | --- |
| `incoming` | oltre la data prevista di arrivo |
| `received` | check di ingresso non fatto entro 24 ore |
| `reconditioning` | oltre 10 giorni |
| `ready` | non pubblicata entro 2 giorni |
| `published` | oltre 60 giorni: avviso; oltre 90: ribasso consigliato |
| `reserved` | oltre 10 giorni senza contratto |
| `sold` | passaggio di proprietà non avviato |
| `delivering` | oltre 7 giorni |
| `withdrawn` | oltre 30 giorni |

**Check delle condizioni.** Procedura guidata a passi: carburante, chilometri (con foto del cruscotto), chiavi e documenti, spie, pneumatici, danni per zona con tipo e gravità, foto obbligatorie (4 angoli, laterali, interni, cruscotto, bagagliaio, ogni danno). Il check `intake` è obbligatorio entro 24 ore dall'ingresso. La funzione `compare_conditions(vehicle_id, from_phase, to_phase)` restituisce le differenze: carburante diverso, chilometri in più (segnala sopra i 50 km non giustificati da una lavorazione), danni nuovi non presenti all'ingresso, danni riparati. Opzionale: un adattatore `VisionAdapter` (mock all'inizio) che confronta le foto e propone i punti da controllare; la conferma resta di una persona.

**Fornitori.** Dalla scheda fornitore si vedono le auto fornite, il tempo medio di vendita e il margine medio (vista), più la valutazione da 1 a 5.

**Pratica e margine**

- Stati: `open`, `quote_sent`, `contract_pending`, `signed`, `payment_pending`, `transfer_documents`, `delivered`, `closed`, `cancelled`.
- Alla creazione della pratica si genera in automatico la voce `vehicle_margin` stimata: `sale_price - purchase_cost - reconditioning_cost`.
- Gli altri tipi di voce (`financing_interest`, `insurance`, `cvt`, `gps`, `etching`, `extended_warranty`, `fees`, `discount`, `salesperson_commission`, `other_cost`) si aggiungono a mano o dal modulo F&I. Ogni voce ha `kind` (ricavo o costo), importo stimato e reale, stato e fonte.
- Margine totale = somma dei ricavi meno somma dei costi. La vista `deal_margin` mostra stimato e reale e, per ogni auto, la quota di margine per tipo di voce. A pratica chiusa si usa l'importo reale se presente, altrimenti lo stimato.
- Se `deposit > 0` il veicolo passa a `reserved`.

**Quando una pratica passa a `signed`** (funzione `on_deal_signed(deal_id)`, in una sola transazione):

1. Il veicolo passa a `sold`, la lead a `won`.
2. Per ogni `listing` del veicolo si inserisce in `outbox` un'azione `withdraw` verso l'integrazione del portale (l'annuncio deve risultare ritirato entro 5 minuti).
3. Si mette in coda la generazione del contratto (sezione 10).
4. Si congelano gli importi stimati come riferimento per il report.
5. Si crea una notifica per amministrazione e F&I con i passi del passaggio di proprietà.

**Annunci e prenotazioni.** Con `reserved` l'annuncio si sospende oppure resta con la dicitura "riservata", secondo `setting.portal_rules`. Se arriva una lead su un annuncio già ritirato, l'IA propone auto simili: stessa `body_type` e prezzo entro il 15%.

## 7. IA, portali e integrazioni

**Principio.** Il gestionale è la fonte unica di verità per stati, lead, veicoli e pratiche. GoHighLevel, le API di WhatsApp e il servizio voce sono solo canali: portano messaggi dentro e fuori. Tutto ciò che è esterno si costruisce dietro un adattatore, con un'implementazione finta (mock) usata finché l'interruttore `FEATURE_*_REAL` è spento.

**Adattatori** (in `src/integrations` e nelle Edge Functions)

```ts
interface PortalAdapter {
  publish(input: ListingInput): Promise<{ externalId: string }>;
  update(externalId: string, input: ListingInput): Promise<void>;
  suspend(externalId: string): Promise<void>;
  withdraw(externalId: string): Promise<void>;
}
interface MessagingAdapter { send(to: string, templateKey: string, vars: Record<string,string>): Promise<{ externalId: string }>; }
interface VoiceAdapter { startCall(to: string, scriptKey: string): Promise<{ externalId: string }>; }
interface VisionAdapter { compare(photosA: string[], photosB: string[]): Promise<{ notes: string[] }>; }
```

| Canale | Adattatore | Stato iniziale |
| --- | --- | --- |
| AutoScout24 | `AutoScout24Adapter` sulla Listing Creation API (REST, JSON, credenziali Basic Auth di un account AutoScout24) | mock; reale quando ci sono le credenziali |
| Subito.it, Automobile.it | `MultiposterAdapter` verso un partner multipubblicatore, da scegliere | mock; il partner e il formato sono da definire |
| Facebook e Instagram | endpoint `GET /feeds/meta` che genera il feed del catalogo veicoli, scaricato da Meta a intervalli | feed generato dai dati reali |
| Google | endpoint `GET /feeds/google` secondo la specifica del feed veicoli (VIN e codice negozio obbligatori) | feed generato dai dati reali |
| Sito del concessionario | `WebsiteAdapter` (feed o API, da definire) | mock |
| WhatsApp, voce, social | `MessagingAdapter` e `VoiceAdapter` su GoHighLevel e API WhatsApp | mock |

**Outbox.** Ogni azione verso l'esterno (pubblica, ritira, invia messaggio) è una riga in `outbox`. La Edge Function `outbox-worker` gira ogni minuto, prende le righe `pending`, chiama l'adattatore e, se fallisce, riprova dopo 1, 5, 15 e 60 minuti (massimo 8 tentativi); poi segna `failed` e notifica marketing e amministratore. Le azioni devono essere idempotenti (chiave su `integration + action + id`).

**Ingresso delle lead.** Edge Function `lead-inbound`, `POST`, con firma HMAC calcolata con `WEBHOOK_SECRET`:

```json
{
  "channel": "whatsapp",
  "source_ref": "listing:autoscout24:12345",
  "contact": {"name": "Mario Rossi", "phone": "+393331234567", "email": null},
  "message": "Buongiorno, la Audi A3 è ancora disponibile?",
  "vehicle_plate": "ZZ101AA",
  "received_at": "2026-10-20T09:30:00+02:00"
}
```

La funzione normalizza il telefono, cerca un cliente esistente per telefono o e-mail (altrimenti lo crea), crea la lead in stato `new` e la `conversation`, e avvia la qualificazione. Edge Function `ai-result` riceve l'esito (`lead_id`, `score`, `intent`, `summary`, `purchase_type`, dati dell'eventuale permuta, `handoff` sì/no) e porta la lead a `qualified` oppure al responsabile se `handoff` è vero. Per i test costruisci un `MockAiQualifier` che assegna un punteggio con regole semplici.

**Interruttori e regole dell'IA** (`setting`, chiavi `ai_switches` e `ai_handoff`)

```json
{
  "ai_switches": {"voice": true, "whatsapp": true, "social": false,
                  "mode": "always", "out_of_hours_reply": true},
  "ai_handoff": {"on_customer_request": true, "after_unanswered_questions": 3,
                 "price_bands": ["D"]},
  "call_recording": false
}
```

`mode` può essere `always`, `after_hours` o `peaks`. Gli interruttori si cambiano dalla schermata Parametri e valgono subito. Se un canale IA è spento, le lead nuove su quel canale vanno al responsabile vendite con una notifica.

**Cosa l'IA non deve fare:** dare prezzi finali o sconti, promettere finanziamenti, confermare la disponibilità di un'auto che il gestionale non mostra libera. All'inizio si presenta come assistente automatico. La registrazione delle chiamate resta spenta finché non c'è l'informativa e il consenso. Per scrivere per primi su WhatsApp servono modelli approvati: aggiungi la tabella `message_template(dealership_id, key, channel, body, variables jsonb, approved bool)`.

## 8. Schermate mobile e piazzale

**Principi.** Si progetta prima a 360-430 px di larghezza; il computer è solo una vista più larga. Barra di navigazione in basso, con le voci che dipendono dal ruolo. Ogni azione frequente richiede al massimo due tocchi. Aree toccabili di almeno 44 px. Formati italiani: data gg/mm/aaaa, orario a 24 ore, importi in euro con il punto per le migliaia (1.234,56 €). Le ultime schermate consultate restano disponibili senza rete e le foto si caricano in coda quando torna la connessione.

| Schermata | Contenuto e azioni | Ruoli |
| --- | --- | --- |
| Oggi | lead da gestire ordinate per tempo residuo, appuntamenti del giorno, avvisi | venditori, responsabile vendite |
| Lead | elenco con stato e conto alla rovescia; scheda con storico e conversazioni; chiama (`tel:`), scrivi su WhatsApp, cambia stato, nota (testo o dettatura), riassegna (responsabile) | venditori, responsabile vendite |
| Auto | ricerca per targa in alto, elenco con filtri (stato, fascia, giorni in stock); scheda con storico, foto, condizioni, lavorazioni, annunci, margine (se permesso) | tutti i ruoli abilitati |
| Check condizioni | procedura a passi con fotocamera (`capture`), foto obbligatorie, confronto con il check precedente | ricondizionamento, usato, piazzale |
| Piazzale | mappa con stalli (vedi sotto) | piazzale, venditori, usato |
| Pratica | voci di margine stimato e reale, generazione del contratto, passi del passaggio di proprietà | amministrazione, F&I, venditori |
| Fornitori | elenco, scheda con auto e statistiche | usato |
| Parametri | timer, pesi e fasce di assegnazione, orari, interruttori IA, regole dei portali; ogni modifica salva lo storico | direzione, responsabile vendite, amministratore |
| Report | indicatori con filtri per periodo, venditore, canale | direzione, responsabile vendite, F&I, amministrazione |
| Import | carica Excel, anteprima, mappatura, esito | usato, amministratore |
| Dispositivi | approva e revoca | amministratore |

**Piazzale con Google Maps**

- Vista satellitare centrata sul concessionario. Gli stalli (`yard_slot`) appaiono come segnaposto colorati per stato (libero, occupato, in officina); una zona ha un contorno. Tocco su uno stallo: targa, modello, giorni in stock.
- Registrare la posizione di un'auto: scegli la targa (ricerca o elenco), tocca lo stallo o un punto della mappa; il sistema sceglie lo stallo più vicino entro 15 metri, aggiorna `vehicle.yard_slot_id`, `yard_status` e `yard_verified_at`, e scrive un `vehicle_event`.
- Disegno degli stalli: il ruolo `yard` o `admin` può aggiungere e rinominare stalli toccando la mappa.
- Allerta per le auto con posizione non verificata da più di 7 giorni. Aggiornamenti in tempo reale tra telefoni con Supabase Realtime sulla tabella `vehicle`.
- Senza `VITE_GOOGLE_MAPS_API_KEY` l'app mostra una griglia per zona con gli stalli, così tutto funziona anche senza mappa.
- Il tracciamento automatico con GPS o BLE non fa parte di questa versione.

## 9. Import, report e dati demo

**Import da Excel.** I file veri arriveranno dopo: le colonne si mappano a schermo, quindi il codice non deve presupporre nomi di colonna.

1. Si carica il file (`.xlsx` o `.csv`) nel bucket `dealercrm-imports` e si sceglie il tipo: veicoli, lead storiche, clienti, fornitori.
2. Anteprima delle prime 20 righe e mappatura di ogni colonna su un campo (si salva in `import_job.mapping` e si riusa).
3. Validazione: targa normalizzata e valida, date e importi leggibili, campi obbligatori presenti. Le righe non valide vanno in `import_row` con il motivo.
4. Duplicati: sulla targa per i veicoli, su telefono o e-mail per clienti e lead. Per ognuno si sceglie: salta, aggiorna, crea nuovo.
5. Prova a vuoto: conteggio di righe valide, scartate e duplicate. Solo dopo la conferma si scrive.
6. Rapporto scaricabile degli scarti. Il file originale non si modifica.

**Report** (viste Postgres e schermata Report, con filtri periodo, venditore, canale, veicolo)

| Area | Indicatori |
| --- | --- |
| Lead | per canale e stato, tempo medio di risposta, tempo medio tra stati, scadute e riassegnate, conversione per canale |
| Venditori | lead ricevute, appuntamenti, chiusure, tasso di chiusura, margine generato, tempo di risposta |
| IA | qualificate, passaggi a un umano, punteggio medio, non valide |
| Veicoli | giorni in stock, costo di ricondizionamento, margine per voce, auto ferme oltre 60 e 90 giorni |
| Fornitori | auto fornite, tempo medio di vendita, margine medio |
| Portali | lead per annuncio e portale, annunci in errore |
| Piazzale | auto senza posizione verificata |

Riepilogo giornaliero e settimanale per direzione e responsabile vendite, come notifica.

**Dati demo da caricare** (`supabase/seed.sql` e `scripts/seed-demo.ts`, tutti con `is_demo = true`). Non creare l'account di Paolo (admin): lo crea lui. Crea invece un `admin.demo@demo.test` solo in sviluppo, e gli utenti seguenti con password dalla variabile `DEMO_PASSWORD`. Per i venditori genera, con seme fisso, circa 50 lead storiche chiuse ciascuno (vinte o perse) in modo che i tassi di chiusura risultino quelli indicati.

| Account | Nome | Ruolo | Fasce | Tasso chiusura 90 gg | Risposta media | Lead 30 gg | Aperte | Disponibile |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| direzione@demo.test | Roberto Valli | owner |  |  |  |  |  | sì |
| resp.vendite@demo.test | Chiara Neri | sales\_manager |  |  |  |  |  | sì |
| venditore.01@demo.test | Marco Rinaldi | salesperson | A-D | 22% | 6 min | 18 | 9 | sì |
| venditore.02@demo.test | Giulia Fontana | salesperson | A-D | 27% | 4 min | 16 | 11 | sì |
| venditore.03@demo.test | Luca Ferretti | salesperson | A-B | 18% | 11 min | 20 | 12 | sì |
| venditore.04@demo.test | Sara Moretti | salesperson | A-D | 25% | 7 min | 14 | 8 | sì |
| venditore.05@demo.test | Andrea Colombo | salesperson | A-B | 14% | 15 min | 21 | 14 | sì |
| venditore.06@demo.test | Elena Gallo | salesperson | A-B | 20% | 9 min | 15 | 7 | no (ferie) |
| venditore.07@demo.test | Davide Bruni | salesperson | A-B | 16% | 12 min | 19 | 10 | sì |
| usato@demo.test | Stefano Greco | used\_manager |  |  |  |  |  | sì |
| ricondizionamento@demo.test | Matteo Sala | reconditioning |  |  |  |  |  | sì |
| piazzale@demo.test | Franco Leoni | yard |  |  |  |  |  | sì |
| amministrazione@demo.test | Anna Conti | accounting |  |  |  |  |  | sì |
| fi@demo.test | Paola Riva | finance\_insurance |  |  |  |  |  | sì |
| marketing@demo.test | Nicola Serra | marketing |  |  |  |  |  | sì |

Le fasce C e D sono abilitate ai tre venditori sopra la mediana del tasso di chiusura (20%): Giulia, Sara, Marco.

**Fornitori demo:** Asta Nord Auto (auction, 4), Autoimport Demo (import, 3), Rossi Auto (dealer, 4), NoleggioPiù (rental\_company, 5), G. Bianchi (private, 3), Permuta cliente C-014 (customer\_trade\_in, 4).

**Veicoli demo**

| Targa | Veicolo | Km | Acquisto | Prezzo | Stato | Fornitore | Giorni in stock | Posizione |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ZZ101AA | Audi A3 Sportback 1.5 TFSI 2019 | 58.000 | 15.200 | 18.900 | published | Asta Nord Auto | 34 | A-12 |
| ZZ102AA | BMW X3 xDrive20d 2021 | 41.000 | 27.500 | 32.500 | reserved | Permuta cliente C-014 | 21 | B-03 |
| ZZ103AA | Fiat Panda 1.2 2017 | 82.000 | 5.600 | 7.400 | published | G. Bianchi | 71 | A-07 |
| ZZ104AA | Mercedes GLC 220d 2022 | 28.000 | 34.800 | 41.000 | published | Rossi Auto | 12 | C-01 |
| ZZ105AA | Volkswagen Golf 1.6 TDI 2018 | 96.000 | 10.900 | 13.900 | reconditioning (carrozzeria) | NoleggioPiù | 5 | officina |
| ZZ106AA | Toyota Yaris Hybrid 2020 | 47.000 | 11.300 | 14.200 | ready | Autoimport Demo | 3 | B-09 |

**Lead demo:** L-001 WhatsApp, Audi A3, fascia B, calda 82, `assigned` a venditore.04. L-002 AutoScout24, BMW X3, fascia C, calda 75, `appointment_set`, venditore.02. L-003 Subito.it, Fiat Panda, fascia A, tiepida 55, `contacted` (2° tentativo senza risposta), venditore.07. L-004 voicemail, Mercedes GLC, fascia D, calda 90, `negotiating`, venditore.01. L-005 Instagram, Volkswagen Golf, fascia B, fredda 30, `ai_qualifying`, non assegnata. L-006 sito, Toyota Yaris, fascia B, tiepida 62, `proposal_sent`, venditore.03. I clienti sono "Cliente 001" ... "Cliente 006", con telefoni fittizi.

**Pratica demo P-001** (L-004, Mercedes GLC, venditore.01, stato `contract_pending`): prezzo 41.000, caparra 2.000, finanziamento 20.000 in 60 rate. Voci stimate: margine veicolo 5.500 (41.000 − 34.800 − 700 di ricondizionamento), interessi 900, assicurazione 350, satellitare 250, CVT 250, marchiatura 150 (ricavi); sconto −500 e provvigione −600 (costi). Margine totale 6.300.

**Altro:** check condizioni della Golf (ingresso: carburante 1/4, 96.000 km, graffio lieve al paraurti posteriore e ammaccatura media sulla portiera anteriore sinistra, 9 foto; dopo la carrozzeria: carburante 1/2, 96.012 km, ammaccatura in riparazione); storico della BMW (ingresso come permuta giorno 0, lavaggio giorno 2, pubblicata giorno 5, lead L-002 giorno 12, test drive giorno 14, riservata giorno 21); dispositivi (iPhone di Marco e iPad showroom autorizzati, iPhone di Chiara autorizzato, Samsung di Andrea `pending`, telefono vecchio di Luca `revoked`); piazzale: zona A con 20 stalli (A-01...A-20), zona B con 15, zona C con 6, officina con 4 postazioni, con le auto nelle posizioni indicate sopra e coordinate fittizie attorno al concessionario.

## 10. Contratto di vendita

Il contratto si genera dalla pratica in un clic e si salva come PDF. Il modello qui sotto è una bozza: il concessionario ha un modello suo che lo sostituirà, quindi il modello deve essere un file sostituibile (`templates/contratto-vendita.md`) con `template_version`, e il codice non deve dipendere dal testo. La bozza va fatta controllare da un legale prima dell'uso.

**Generazione.** Edge Function `generate-contract(deal_id)`: legge pratica, cliente, veicolo, voci, permuta e finanziamento; riempie i segnaposto `{{...}}` del modello; produce HTML e poi PDF (scegli una libreria compatibile con le Edge Functions; se non è possibile, genera il PDF dal browser con un foglio di stile di stampa); salva nel bucket `dealercrm-documents`; scrive `contract` con `data` (copia dei valori usati) e `pdf_path`. Se un dato obbligatorio manca, la funzione risponde con l'elenco dei campi mancanti e non genera il PDF.

**Segnaposto e origine**

| Segnaposto | Origine |
| --- | --- |
| `{{seller.*}}` (ragione sociale, sede, P. IVA, legale rappresentante) | `dealership` e impostazioni |
| `{{buyer.*}}` (nome, nascita, residenza, CF, P. IVA, documento, contatti) | `customer` |
| `{{buyer.is_consumer}}` | `deal` (consumatore o professionista) |
| `{{vehicle.*}}` (marca, modello, targa, telaio, immatricolazione, km, alimentazione, colore, proprietari, dotazioni) | `vehicle` |
| `{{price}}`, `{{vat_regime}}`, `{{deposit}}`, `{{balance}}`, `{{payment_method}}` | `deal` |
| `{{trade_in.*}}` | `deal.trade_in` |
| `{{financing.*}}` (finanziaria, importo, rate, TAN, TAEG) | `deal.financing` |
| `{{services[]}}` (garanzia estesa, polizza, CVT, satellitare, marchiatura, con prezzo) | `deal_item` |
| `{{warranty_months}}` | `deal.warranty_months` (24, o 12 per i beni usati se concordato per iscritto) |
| `{{delivery_date}}`, `{{delivery_place}}`, `{{transfer_days}}`, `{{transfer_costs_by}}`, `{{transfer_costs_amount}}` | `deal` |
| `{{conclusion_type}}` | `deal.conclusion_type` |
| `{{privacy_marketing_consent}}` | `customer.marketing_consent` |

**Modello (bozza)**

```markdown
# CONTRATTO DI VENDITA DI VEICOLO USATO

## 1. Parti
Venditore: {{seller.name}}, sede {{seller.address}}, P. IVA {{seller.vat}}, rappresentata da {{seller.legal_rep}}.
Acquirente: {{buyer.full_name}}, nato/a a {{buyer.birth_place}} il {{buyer.birth_date}}, residente in {{buyer.address}}, CF {{buyer.tax_code}}, documento {{buyer.id_document}}, tel. {{buyer.phone}}, e-mail {{buyer.email}}.
L'acquirente agisce come: {{buyer.capacity}} (consumatore / professionista).

## 2. Veicolo
{{vehicle.make}} {{vehicle.model}} {{vehicle.trim}}, targa {{vehicle.plate}}, telaio {{vehicle.vin}}, prima immatricolazione {{vehicle.first_registration}}, {{vehicle.mileage}} km, {{vehicle.fuel}}, colore {{vehicle.color}}, proprietari precedenti {{vehicle.previous_owners}}. Dotazioni: {{vehicle.equipment}}. Chiavi consegnate: {{vehicle.keys}}.
L'acquirente dichiara di aver ricevuto copia del libretto e di aver preso visione della scheda delle condizioni del veicolo (Allegato A).

## 3. Prezzo e pagamento
Prezzo: euro {{price}} ({{vat_regime}}). Caparra: euro {{deposit}} versata il {{deposit_date}}. Permuta: euro {{trade_in.value}}. Quota finanziata: euro {{financing.amount}}. Saldo alla consegna: euro {{balance}} con mezzi tracciabili.
In caso di mancato pagamento del saldo entro {{balance_due_date}}, il venditore può considerare risolto il contratto e trattenere la caparra nei limiti dell'art. 1385 del Codice civile.

## 4. Permuta e finanziamento
{{#trade_in}}Permuta: {{trade_in.make}} {{trade_in.model}}, targa {{trade_in.plate}}, telaio {{trade_in.vin}}, {{trade_in.mileage}} km, valutata euro {{trade_in.value}}. L'acquirente ne garantisce la proprietà e l'assenza di gravami, fermi e ipoteche. Passaggio di proprietà entro {{transfer_days}} giorni; sanzioni e tributi fino ad allora a carico dell'acquirente.{{/trade_in}}
{{#financing}}Finanziamento: {{financing.company}}, euro {{financing.amount}} in {{financing.installments}} rate da euro {{financing.installment_amount}}, TAN {{financing.tan}}%, TAEG {{financing.taeg}}%. Se la finanziaria non approva entro {{financing.approval_days}} giorni, ciascuna parte può recedere e la caparra è restituita.{{/financing}}

## 5. Servizi accessori (facoltativi, a costo separato)
{{#services}}- {{name}}: euro {{price}} ({{provider}}, {{duration}}){{/services}}
Per le polizze assicurative il venditore opera nei limiti della propria iscrizione al RUI e consegna la documentazione precontrattuale.

## 6. Garanzia
Se l'acquirente è consumatore, si applica la garanzia legale di conformità del Codice del Consumo, di {{warranty_months}} mesi dalla consegna (per i beni usati le parti possono pattuire una durata non inferiore a 12 mesi). Il venditore dichiara che il veicolo è nelle condizioni dell'Allegato A, che i chilometri sono corretti e che è libero da gravami, fermi e ipoteche. L'eventuale garanzia estesa si aggiunge e non sostituisce la garanzia legale.

## 7. Consegna e passaggio di proprietà
Consegna il {{delivery_date}} presso {{delivery_place}}, con verbale (km, carburante, stato). Il venditore cura il passaggio di proprietà al PRA entro {{transfer_days}} giorni dal saldo; spese di passaggio a carico di {{transfer_costs_by}}, euro {{transfer_costs_amount}}. I rischi passano all'acquirente alla consegna; l'acquirente attiva la RC obbligatoria prima di circolare.

## 8. Recesso, privacy, foro
Recesso: se il contratto è concluso {{conclusion_type}} ed è a distanza o fuori dai locali commerciali con acquirente consumatore, spetta il recesso entro 14 giorni dalla consegna; se firmato nei locali del venditore non c'è recesso, salvo quanto previsto ai punti 3 e 4.
Privacy: informativa ai sensi del Regolamento UE 2016/679 (Allegato B). Consenso a contatti commerciali: {{privacy_marketing_consent}}.
Foro: se l'acquirente è consumatore, il giudice del suo luogo di residenza o domicilio; altrimenti il foro di {{seller.court_city}}.
Allegati: A scheda condizioni e foto; B informativa privacy; C copia documenti di circolazione.

{{place}}, {{date}}
Il Venditore ____________  L'Acquirente ____________
L'acquirente approva espressamente le clausole su caparra, garanzia, recesso e foro competente.
L'Acquirente ____________
```

## 11. Ordine di lavoro e criteri di accettazione

Lavora una fase alla volta, in questo ordine. Ogni fase si chiude con: pull request, migrazioni applicate, test verdi, `docs/DECISIONS.md` aggiornato e un breve elenco di cosa provare a mano.

| Fase | Cosa si costruisce | Fatto quando |
| --- | --- | --- |
| 0. Base | struttura della repo, PWA installabile, collegamento a Supabase, lint e test, `docs/ENV.md`, `docs/DECISIONS.md` | l'app si apre da telefono, si installa e mostra una schermata di accesso |
| 1. Accessi | login con secondo fattore, profili e ruoli, RLS, dispositivi con approvazione, tabella `setting` con storico, schermate Parametri e Dispositivi, utenti demo | un dispositivo non approvato non vede dati; ogni ruolo vede solo quanto in sezione 3; le modifiche ai parametri hanno storico |
| 2. Veicoli | fornitori, veicoli, ricerca per targa, storico, foto, lavorazioni, check delle condizioni con confronto, import Excel, veicoli demo | cercando `ZZ102AA` si apre lo storico completo; il check di ingresso e quello dopo la lavorazione mostrano le differenze; un import con duplicati dice cosa farebbe prima di scrivere |
| 3. Lead | clienti, lead, conversazioni, funzione `change_lead_status`, timer e `pg_cron`, `assign_lead`, schermate Oggi e Lead, notifiche, `lead-inbound`, `ai-result`, `MockAiQualifier`, lead e venditori demo | una lead inviata a `lead-inbound` passa da `new` a `assigned` da sola; senza presa in carico viene segnalata a 15 e 30 minuti e riassegnata a 60; le assegnazioni rispettano fasce e rotazione e salvano il motivo; spegnere l'IA dalla schermata Parametri ha effetto subito |
| 4. Pratiche | pratiche, voci di margine, viste `deal_margin`, `on_deal_signed`, outbox con worker e mock dei portali, contratto in PDF, pratica demo | su P-001 il margine stimato è 6.300 e per ogni voce si vede la quota; portando la pratica a `signed` l'auto passa a `sold`, la lead a `won`, gli annunci finti risultano ritirati e il contratto si genera con i dati giusti |
| 5. Piazzale | zone e stalli, mappa Google, registrazione della posizione, allerte, vista a griglia senza chiave | si registra la posizione di un'auto in due tocchi e un altro telefono la vede aggiornata; senza chiave Maps la griglia funziona |
| 6. Report | viste e schermata Report, riepiloghi giornaliero e settimanale | gli indicatori della sezione 9 tornano numeri coerenti con i dati demo |
| 7. Collegamenti veri | uno alla volta, dietro `FEATURE_*_REAL`: AutoScout24, multipubblicatore per Subito e Automobile.it, feed Meta e Google, GoHighLevel con WhatsApp, voce e social | ogni collegamento ha un test su dati finti e si accende solo con le credenziali presenti; se fallisce, l'outbox ritenta e poi notifica |

**Cose da non inventare: chiedile a Paolo**

- Credenziali e accessi (AutoScout24, GoHighLevel, WhatsApp, Google Maps).
- Il partner multipubblicatore per Subito e Automobile.it.
- Il modello di contratto vero e i dati societari del concessionario.
- Orari di lavoro, giorni festivi, regola della provvigione dei venditori, regime IVA.
- I file Excel di partenza.

**Criteri generali:** nessuna tabella senza RLS; nessun costo visibile ai ruoli che non devono vederlo; ogni cambio di stato di lead e veicoli ha un evento; tutti i valori modificabili stanno in `setting`; l'app funziona completa con i mock; i dati demo si cancellano con `is_demo = true`.

## 12. Piazzale su Google Maps

**Cosa usare.** Solo la **Maps JavaScript API** (prodotto "Dynamic Maps"), con `mapTypeId: 'satellite'`, un **Map ID** creato in Cloud Console (obbligatorio per gli Advanced Markers) e `@googlemaps/js-api-loader`. Niente API Geolocation di Google: la posizione del telefono arriva da `navigator.geolocation` del browser, gratis. Niente Places. Geocoding solo una volta, per ricavare le coordinate della sede dall'indirizzo (si può fare a mano).

**Costi.** Dal marzo 2025 ogni SKU ha una quota gratuita mensile separata: Dynamic Maps 10.000 caricamenti al mese, poi 7 $ ogni 1.000. Un caricamento = un'apertura della mappa; con 10 persone che aprono il piazzale 30 volte al giorno si resta sotto i 10.000. Serve comunque un account di fatturazione Cloud attivo.

**Chiave API.** Due chiavi: una per il browser (`VITE_GOOGLE_MAPS_API_KEY`) limitata per referrer HTTP ai domini dell'app e alla sola Maps JavaScript API; una server (`GOOGLE_MAPS_SERVER_KEY`, opzionale) limitata per IP per il geocoding. Nessuna chiave senza restrizioni.

**Dati** (già in schema): `dealership.lat`, `dealership.lng`; `yard_slot.lat`, `yard_slot.lng`; `yard_zone.geometry` (poligono GeoJSON); riga `setting` con chiave `maps`:

```json
{"provider":"google","map_id":null,"map_type":"satellite","default_zoom":19,"tilt":0,"snap_radius_m":15,"stale_position_days":7,"geolocation":"browser"}
```

Funzione `dealercrm.yard_slot_nearest(lat, lng, radius_m)` restituisce lo stallo più vicino e la distanza in metri.

**Schermata Piazzale**

1. Mappa satellitare centrata su `dealership.lat/lng`, zoom da `setting.maps.default_zoom`, controlli ridotti (niente street view, niente map type). Poligoni delle zone da `yard_zone.geometry` con contorno sottile.
2. Un Advanced Marker per ogni `yard_slot` con coordinate: pallino verde se libero, teal con targa se occupato, arancione se in officina, rosso se la posizione non è verificata da più di `stale_position_days`. Tocco sul marker: scheda con targa, modello, giorni in stock, pulsanti Scheda e Conferma posizione.
3. Registrare la posizione: scegli la targa (ricerca o elenco), poi tocca la mappa. Il client chiama `yard_slot_nearest` con il punto toccato: se la distanza è entro `snap_radius_m` usa quello stallo, altrimenti propone di creare uno stallo nuovo in quel punto (solo ruoli `yard` e `admin`). Poi `set_vehicle_yard_position(vehicle_id, slot_id, yard_status)`.
4. Pulsante "Sono qui": `navigator.geolocation.getCurrentPosition` con `enableHighAccuracy: true`; se l'accuratezza è peggiore di 20 m si mostra l'avviso e si chiede di toccare la mappa.
5. Disegno stalli: il ruolo `yard` o `admin` tocca a lungo la mappa per aggiungere uno stallo (codice proposto progressivo nella zona), lo trascina per correggerlo, lo rinomina dalla scheda. Le coordinate si salvano in `yard_slot.lat/lng`.
6. Aggiornamenti in tempo reale con Supabase Realtime sulla tabella `vehicle`: i marker si colorano senza ricaricare.
7. Senza `VITE_GOOGLE_MAPS_API_KEY` o senza `map_id` resta la vista a griglia già prevista: tutto funziona lo stesso.

**Da chiedere a Paolo:** indirizzo esatto della sede (o lat/lng), Map ID, chiave browser con restrizioni; se le zone del piazzale hanno già un disegno.

## 13. Fatture in Cloud

**Principio.** La pratica resta in Supabase; Fatture in Cloud è il registro fiscale. Dal gestionale si crea la fattura (o la proforma) a partire dalla pratica e si tiene il collegamento con l'id del documento; lo stato (inviata a SDI, pagata, stornata) torna indietro via webhook. Nessuna fattura si scrive a mano due volte.

**API** (base `https://api-v2.fattureincloud.it`, header `Authorization: Bearer <token>`, JSON):

| Uso | Chiamata |
| --- | --- |
| Aziende del token | `GET /user/companies` → `company_id` |
| Dati per compilare una fattura | `GET /c/{company_id}/issued_documents/info` |
| Aliquote IVA | `GET /c/{company_id}/info/vat_types` |
| Metodi e conti di pagamento | `GET /c/{company_id}/info/payment_methods`, `GET /c/{company_id}/info/payment_accounts` |
| Clienti | `GET/POST /c/{company_id}/entities/clients` |
| Verifica totali senza creare | `POST /c/{company_id}/issued_documents/totals` |
| Crea fattura, proforma, nota di credito | `POST /c/{company_id}/issued_documents` con `data.type` = `invoice`, `proforma`, `credit_note` |
| Leggi documento | `GET /c/{company_id}/issued_documents/{id}` |
| Webhook | `POST /c/{company_id}/subscriptions` |

Limiti: 1.000 richieste/ora e 40.000/mese per azienda, 300 in 5 minuti; oltre arriva 429 o 403 con `Retry-After`. Il pagamento totale deve coincidere con il totale documento, altrimenti 422: si manda `options.fix_payments: true`.

**Autenticazione.** OAuth 2.0 Authorization Code: `GET /oauth/authorize` con `response_type=code`, `client_id`, `redirect_uri`, `scope` (separati da spazio), `state`; poi `POST /oauth/token` con `grant_type=authorization_code`. L'access token dura 24 ore (`expires_in` 86400); il refresh token dura un anno dall'ultimo uso e si rinnova con `grant_type=refresh_token`. Scope richiesti: `entity.clients:a issued_documents.invoices:a issued_documents.proformas:a issued_documents.credit_notes:a issued_documents.receipts:a products:r settings:r situation:r`. In sviluppo si può usare un token manuale creato dall'utente in Fatture in Cloud (non scade). Il `client_secret` sta solo nelle Edge Functions.

**Già pronto in Supabase**

- Tabelle: `fic_connection` (token, solo service\_role), vista `fic_connection_status`, `invoice` (collegamento pratica ↔ documento, stati `draft` `queued` `created` `sent` `paid` `error` `cancelled`, `dry_run`), `fic_webhook_event` (dedup su id CloudEvents).
- Riga `setting` con chiave `fatture_in_cloud`: `enabled`, `dry_run`, `company_id`, `numeration`, `e_invoice`, `vat_kind`, `vat_id_standard`, `vat_id_margin`, `payment_method_id`, `payment_account_id`, `ei_payment_method`, `invoice_on` (`signed` o `delivered`), `item_vat`.
- `build_invoice_payload(deal_id)`: costruisce il corpo nel formato di Fatture in Cloud: voce veicolo in regime del margine (art. 36 D.L. 41/1995, `vat_id_margin`, IVA non esposta), voci accessorie (satellitare, CVT, marchiatura, garanzia estesa, spese) scorporate al 22% con `vat_id_standard`, caparra come pagamento già incassato, saldo a 30 giorni al netto di permuta e finanziamento.
- `request_invoice(deal_id, kind)`: crea la riga `invoice` in stato `queued` e un'azione `fatture_in_cloud / create_invoice` in `outbox`.
- Edge Functions: `fic-oauth` (`?action=start&dealership_id=` avvia il collegamento, `?action=callback` salva i token e sceglie l'azienda), `fic-invoice` (`POST {deal_id}` o `{invoice_id}`; con `dry_run` chiama solo `/totals` e salva l'esito; `GET ?action=lookups` restituisce IVA, metodi e conti per la schermata Parametri), `fic-webhook` (verifica il challenge, controlla la firma ES256, salva gli eventi).
- Segreti da impostare nelle Edge Functions: `FIC_CLIENT_ID`, `FIC_CLIENT_SECRET`, `FIC_REDIRECT_URI` (URL di `fic-oauth` con `?action=callback`), `FIC_STATE_SECRET`, `FIC_WEBHOOK_PUBLIC_KEY_B64`.

**Da fare nell'app**

1. Parametri → sezione Fatture in Cloud: pulsante "Collega" che apre `fic-oauth?action=start`; stato da `fic_connection_status`; dopo il collegamento chiama `fic-invoice?action=lookups` e fa scegliere aliquota standard, aliquota regime del margine, metodo e conto di pagamento, numerazione; interruttori `enabled` e `dry_run`.
2. `outbox-worker`: per `integration = 'fatture_in_cloud'` e `action = 'create_invoice'` chiama `fic-invoice` con `invoice_id`; su 429/403 rispetta `Retry-After`.
3. Pratica: pulsanti "Proforma" e "Fattura" (ruoli `accounting`, `admin`, `owner`); con `invoice_on = delivered` la fattura si mette in coda in automatico quando la pratica passa a `delivered`. Scheda con numero, data, totale, stato, link al documento in Fatture in Cloud e pulsante "Nota di credito".
4. Cliente: prima della fattura servono codice fiscale o partita IVA, indirizzo completo, codice destinatario o PEC per la fattura elettronica: aggiungere i campi a `customer` (`tax_code`, `vat_number`, `address_street`, `address_postal_code`, `address_province`, `ei_code`, `certified_email`) e il controllo dei campi mancanti prima di inviare.
5. Report: fatturato del mese da `invoice` confrontato con il margine delle pratiche.
6. Registrare il webhook una volta per azienda (`POST /c/{company_id}/subscriptions` con `sink` = URL di `fic-webhook`, `types` = `it.fattureincloud.webhooks.issued_documents.all.update` e `it.fattureincloud.webhooks.issued_documents.all.delete`); il sink deve rispondere al challenge in 200 con `{"verification": ...}`.

**Da chiedere a Paolo:** l'app registrata su Fatture in Cloud (client id e secret, redirect URL), quale azienda usare, aliquota e natura usate oggi per il regime del margine, se la fattura va emessa alla firma o alla consegna, se serve anche la proforma.
