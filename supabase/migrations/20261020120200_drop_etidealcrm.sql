-- Rimuove il vecchio schema etidealcrm (solo dati demo), sostituito da dealercrm.
-- I job pg_cron etidealcrm-* sono già stati tolti dalla migrazione dello schema dealercrm.
DROP POLICY IF EXISTS etidealcrm_vehicle_photos ON storage.objects;
DROP POLICY IF EXISTS etidealcrm_documents ON storage.objects;
DROP POLICY IF EXISTS etidealcrm_imports ON storage.objects;
DROP POLICY IF EXISTS etidealcrm_call_audio ON storage.objects;
DROP SCHEMA IF EXISTS etidealcrm CASCADE;
