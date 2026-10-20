# Variabili d'ambiente e segreti

## Frontend (file `.env`, prefisso `VITE_`, pubbliche nel browser)

| Variabile | Uso | Stato |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | `https://moyfkdwsghidkcifesrg.supabase.co` | nota |
| `VITE_SUPABASE_ANON_KEY` | chiave pubblica del progetto (da sola non dà accesso a nessun dato: servono login e dispositivo approvato) | da copiare dalla dashboard Supabase |
| `VITE_GOOGLE_MAPS_API_KEY` | mappa del piazzale (Maps JavaScript API). Chiave limitata per referrer HTTP (`pbaldassare.github.io/*`, `localhost:8080/*`) e alla sola Maps JavaScript API. Per GitHub Pages va nella variabile del repository con lo stesso nome | creata, da limitare |
| `VITE_GOOGLE_MAPS_MAP_ID` | Map ID per gli Advanced Markers (anche in `setting.maps.map_id`). Senza, si usa `DEMO_MAP_ID` di prova | da creare per la produzione |

## Edge Functions (segreti Supabase: `supabase secrets set NOME=valore`)

| Segreto | Funzione | Stato |
| --- | --- | --- |
| `WEBHOOK_SECRET` | `lead-inbound`, `ai-result`: firma HMAC-SHA256 del corpo grezzo, in esadecimale, nell'header `x-webhook-signature`. **Senza segreto le funzioni rifiutano ogni richiesta** | da impostare |
| `DEALERSHIP_ID` | `lead-inbound`: concessionario delle lead in ingresso (se manca, il primo) | opzionale |
| `FEATURE_MESSAGING_REAL` | `lead-inbound`: con `true` aspetta l'esito dell'IA vera su `ai-result`; altrimenti qualifica subito con `MockAiQualifier` | `false` |
| `FIC_CLIENT_ID`, `FIC_CLIENT_SECRET` | `fic-oauth`, `fic-invoice` (app registrata su secure.fattureincloud.it/settings-developers) | mancano |
| `FIC_REDIRECT_URI` | `fic-oauth`: `https://moyfkdwsghidkcifesrg.supabase.co/functions/v1/fic-oauth?action=callback`, identico a quello registrato nell'app | manca |
| `FIC_STATE_SECRET` | `fic-oauth`: firma dello state OAuth (una stringa casuale lunga) | manca |
| `FIC_WEBHOOK_PUBLIC_KEY_B64` | `fic-webhook`: chiave pubblica PEM in Base64 pubblicata su developers.fattureincloud.it/docs/webhooks/notifications. **Senza chiave il webhook rifiuta gli eventi** | manca |
| `ANTHROPIC_API_KEY` | `vision`: legge km e carburante dalla foto del cruscotto e confronta le foto di due check (modello `claude-opus-5-5`). Senza chiave la funzione usa un confronto di prova sui soli dati inseriti | da impostare |
| `GOOGLE_MAPS_SERVER_KEY` | geocoding lato server (opzionale), chiave limitata per IP | opzionale |
| `AUTOSCOUT24_API_USER`, `AUTOSCOUT24_API_PASSWORD` | adattatore AutoScout24 | mancano |
| `GHL_API_KEY`, `GHL_LOCATION_ID` | GoHighLevel (WhatsApp, voce, social) | mancano |
| `FEATURE_PORTALS_REAL` | accende i connettori veri dei portali al posto dei mock | `false` |

Esempio di firma per provare `lead-inbound` da terminale:

```sh
BODY='{"channel":"whatsapp","contact":{"name":"Mario Rossi","phone":"3331234567"},"message":"La Audi A3 è disponibile?","vehicle_plate":"ZZ101AA"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" -hex | sed 's/^.* //')
curl -X POST https://moyfkdwsghidkcifesrg.supabase.co/functions/v1/lead-inbound -H "x-webhook-signature: $SIG" -H 'Content-Type: application/json' -d "$BODY"
```

## Seed demo

La migrazione `20261020120100_dealercrm_demo.sql` crea gli utenti demo in Supabase Auth solo se mancano e solo se è impostata la password:
prima di applicarla in un ambiente nuovo eseguire `SET app.demo_password = '<password>';` nella stessa sessione.
Gli utenti demo esistenti sul progetto hanno una password nota: cambiarla o disattivarli prima di dare accesso a persone esterne.
