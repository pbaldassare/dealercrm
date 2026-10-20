# Decisioni

Scelte prese dove la specifica lasciava spazio o dove c'era un conflitto. Ogni voce: cosa si è deciso e perché.

## 2026-10-20 — Schema unico `dealercrm`

Lo schema `etidealcrm` e le sue 22 migrazioni sono stati sostituiti da `dealercrm`, scritto in due file (schema e dati demo). Il vecchio schema conteneva solo dati demo. I bucket dello Storage hanno il prefisso `dealercrm-` perché il progetto Supabase è condiviso con altre app.

## Sicurezza

- **Nessun accesso anonimo.** Tabelle, viste e funzioni sono revocate a `PUBLIC` e `anon`. La chiave pubblica nel browser non basta per leggere o scrivere nulla.
- **Dispositivi.** `my_role()` e `my_dealership()` restituiscono un valore solo con utente attivo e dispositivo approvato (header `x-device-id`). Tutte le policy passano da lì, quindi un dispositivo non approvato non vede dati. Eccezioni: il proprio profilo e i propri dispositivi, che servono per la schermata di attesa. L'amministratore è esente, altrimenti nessuno potrebbe approvare il primo dispositivo. Resta una protezione pratica, non assoluta: l'identificativo vive nel browser e si può copiare.
- **Ruoli.** Solo l'amministratore modifica i profili (ruolo compreso) e approva i dispositivi. La registrazione del dispositivo passa da `register_device()`.
- **Stati.** Un trigger blocca gli `UPDATE` di `status` su lead, veicoli e pratiche fuori dalle funzioni dedicate; una pratica nuova parte sempre da `open`.
- **Webhook.** `lead-inbound` e `ai-result` richiedono la firma HMAC; `fic-webhook` richiede la chiave pubblica di Fatture in Cloud. Senza segreto rifiutano tutto.

## Timer delle lead

- I timer sotto le 24 ore (nuova, qualificata, assegnata, IA al telefono) contano solo l'orario di lavoro di `setting.lead_timers.work_hours`; quelli lunghi (contattata 2 giorni, proposta 3 giorni, trattativa 7 giorni) contano i giorni di calendario. Contare 2.880 minuti lavorativi avrebbe trasformato "2 giorni" in quasi una settimana.
- Lead assegnata e non presa in carico: avviso al venditore (15'), avviso al responsabile (30'), riassegnazione (60'). Il livello raggiunto è in `lead.escalation_level`, così ogni avviso parte una volta sola. La riassegnazione esclude il venditore precedente e fa ripartire il timer. Oltre `max_reassignments` la lead va al responsabile vendite.
- Negli altri stati alla scadenza parte un promemoria, poi il timer si ferma finché lo stato non cambia.
- IA che non conclude in tempo: la lead passa a "qualificata" e si assegna (passaggio a una persona).
- Persa in automatico dopo `auto_lose_days` senza cambi di stato né contatti.

## Lead in ingresso

- Il cliente si riconosce dal telefono normalizzato (E.164, +39 se manca il prefisso) o dall'e-mail.
- Interruttori IA per canale: telefono e segreteria → `voice`; WhatsApp, portali e sito → `whatsapp`; Facebook e Instagram → `social`; in sede nessuna IA. Con l'interruttore spento la lead resta "nuova" ed è assegnata al responsabile vendite con una notifica.
- Finché `FEATURE_MESSAGING_REAL` è spento, `MockAiQualifier` dà un punteggio con regole semplici e la lead arriva da sola fino ad "assegnata".

## Pratiche

- `set_deal_status()` permette solo passi in avanti nella sequenza della specifica, più l'annullamento (non da consegnata o chiusa). Non si supera "firmata" senza firmare.
- Annullando una pratica, l'auto riservata o venduta torna "pubblicata" se ha annunci attivi, altrimenti "pronta".
- Consegnata la pratica, l'auto passa a "consegnata".
- Alla firma si congelano gli importi stimati in una riga `contract` (senza documento); `generate-contract` la completa.
- Demo: la pratica P-001 ha una caparra, quindi la regola della sezione 6 riserva la Mercedes GLC (nella tabella dei veicoli demo risultava "pubblicata").

## Contratto e fatture

- Il contratto è per ora una bozza HTML stampabile con i dati principali, nel bucket `dealercrm-documents`; il PDF e il modello definitivo arrivano con la fase 4.
- La fattura si invia direttamente da `fic-invoice` (dal pulsante o alla consegna): l'outbox resta per i soli portali. In modalità prova, o con parametri mancanti, si verificano solo i totali.

## Piazzale su Google Maps (fase 5)

- **Map ID.** Si usa `VITE_GOOGLE_MAPS_MAP_ID`, poi `setting.maps.map_id`, altrimenti `DEMO_MAP_ID` (quello di prova di Google, segnalato a schermo). Così la mappa funziona appena c'è la chiave; il Map ID vero si crea in Cloud Console quando si va in produzione.
- **Disegno degli stalli.** Invece del tocco lungo, un pulsante "Disegna stalli" (ruoli piazzale e admin): in quella modalità un tocco aggiunge uno stallo e i segnaposto si trascinano. Sul telefono il tocco lungo si confonde con lo spostamento della mappa.
- **Zona del nuovo stallo.** Quella dello stallo più vicino, oppure quella scelta a schermo; codice progressivo nella zona (`A-21`).
- **Stallo occupato.** Non si mette un'auto in uno stallo già occupato da un'altra: prima si sposta quella.
- **Tocco lontano dagli stalli.** Oltre `snap_radius_m` il piazzale o l'admin possono creare lì uno stallo nuovo e metterci l'auto; gli altri ruoli devono toccare uno stallo.
- **"Sono qui".** Con accuratezza peggiore di 20 m si mostra l'avviso e si chiede di toccare la mappa; altrimenti vale come tocco.
- **Aggiornamento tra telefoni.** Dopo ogni modifica l'app manda un avviso sul canale Realtime `dealercrm-yard` (senza dati) e gli altri telefoni rileggono dal database, quindi con la RLS e il controllo del dispositivo; in più rilettura ogni 30 secondi. Le notifiche Realtime sulle tabelle non portano l'header `x-device-id` e la RLS le bloccherebbe.
- **Sede.** L'admin salva come sede il centro attuale della mappa; senza sede la mappa si centra sugli stalli.

## Backoffice

- **Un solo sistema.** Telefono e computer usano la stessa app: su schermi larghi sidebar a sezioni, ricerca globale e tabelle; sul telefono barra in basso ed elenchi.
- **Lead inserita a mano.** Il venditore la crea già "contattata" e assegnata a sé (cliente in salone o al telefono). Il responsabile la crea "qualificata" e la assegna a un venditore o con l'assegnazione automatica, così parte il timer di presa in carico.
- **Cliente.** Si riconosce dal telefono (E.164) o dall'e-mail anche quando si inserisce a mano; i dati per contratto e fattura elettronica sono nella scheda cliente.
- **Annunci.** Le azioni passano da `queue_listing_action` e dall'outbox; pubblicare un'auto "pronta" la porta a "pubblicata". Si pubblicano solo auto pronte, pubblicate o riservate.
