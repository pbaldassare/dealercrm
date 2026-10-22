# Environment variables

Browser variables must use the `VITE_` prefix. Never put `SUPABASE_SERVICE_ROLE_KEY` in client code.

| Variable | Use | Default / status |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Supabase API | `https://moyfkdwsghidkcifesrg.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Publishable/anon key for the browser client | from the linked project |
| `VITE_SUPABASE_SCHEMA` | PostgREST schema | `etidealcrm` |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions only | secret; not in the repo |
| `VITE_GOOGLE_MAPS_API_KEY` | Yard map | empty → grid fallback |
| `FEATURE_PORTALS_REAL` | Real portal adapters | `false` |
| `FEATURE_MESSAGING_REAL` | Real WhatsApp/voice | `false` |
| `AUTOSCOUT24_API_USER` | AutoScout24 | empty (mock) |
| `AUTOSCOUT24_API_PASSWORD` | AutoScout24 | empty (mock) |
| `GHL_API_KEY` | GoHighLevel | empty (mock) |
| `GHL_LOCATION_ID` | GoHighLevel | empty (mock) |
| `WEBHOOK_SECRET` | Inbound HMAC | generate before enabling webhooks |
| `DEMO_PASSWORD` | Demo Auth users `@demo.test` | `Demo!2026crm` locally; do not commit a production password |

Copy `.env.example` to `.env.local` for Vite.

## Demo login

- `admin.demo@demo.test` and other §9 roles (`venditore.01@demo.test`, …)
- Device approval is off: after login the app opens without “In attesa di approvazione”

## Phase 7 — real connectors

Left off. No AutoScout24, GoHighLevel, WhatsApp, or Maps credentials were provided. Do not turn `FEATURE_*_REAL` on until Paolo supplies keys.
