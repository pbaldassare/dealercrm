# Variabili d'ambiente e segreti

## Frontend (file `.env`, prefisso `VITE_`, pubbliche nel browser)

| Variabile | Uso | Stato |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | `https://moyfkdwsghidkcifesrg.supabase.co` | nota |
| `VITE_SUPABASE_ANON_KEY` | chiave pubblica del progetto | da copiare dalla dashboard Supabase |
| `VITE_GOOGLE_MAPS_API_KEY` | mappa del piazzale (Maps JavaScript API). Chiave limitata per referrer HTTP e alla sola Maps JavaScript API | da creare |
| `VITE_GOOGLE_MAPS_MAP_ID` | Map ID per gli Advanced Markers (anche in `setting.maps.map_id`) | da creare |

## Edge Functions (segreti Supabase: `supabase secrets set NOME=valore`)

| Segreto | Funzione | Stato |
| --- | --- | --- |
| `WEBHOOK_SECRET` | `lead-inbound` (firma dei webhook in ingresso) | da impostare |
| `FIC_CLIENT_ID`, `FIC_CLIENT_SECRET` | `fic-oauth`, `fic-invoice` (app registrata su secure.fattureincloud.it/settings-developers) | mancano |
| `FIC_REDIRECT_URI` | `fic-oauth`: `https://moyfkdwsghidkcifesrg.supabase.co/functions/v1/fic-oauth?action=callback`, identico a quello registrato nell'app | manca |
| `FIC_STATE_SECRET` | `fic-oauth`: firma dello state OAuth (una stringa casuale) | manca |
| `FIC_WEBHOOK_PUBLIC_KEY_B64` | `fic-webhook`: chiave pubblica PEM in Base64 pubblicata su developers.fattureincloud.it/docs/webhooks/notifications | manca |
| `GOOGLE_MAPS_SERVER_KEY` | geocoding lato server (opzionale), chiave limitata per IP | opzionale |
| `AUTOSCOUT24_API_USER`, `AUTOSCOUT24_API_PASSWORD` | adattatore AutoScout24 | mancano |
| `GHL_API_KEY`, `GHL_LOCATION_ID` | GoHighLevel (WhatsApp, voce, social) | mancano |
| `FEATURE_PORTALS_REAL`, `FEATURE_MESSAGING_REAL` | accendono i connettori veri al posto dei mock | `false` |

## Seed demo

La migrazione `20261019152401_etidealcrm_demo_auth_users.sql` legge la password degli utenti demo da `current_setting('app.demo_password')`:
prima di applicarla in un ambiente nuovo eseguire `SET app.demo_password = '<password>';` nella stessa sessione.
Gli utenti demo esistenti sul progetto hanno una password nota: cambiarla o disattivarli prima di dare accesso a persone esterne.
