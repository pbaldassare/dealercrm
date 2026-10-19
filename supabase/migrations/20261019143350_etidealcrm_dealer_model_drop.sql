-- Authorized overwrite of schema etidealcrm only (leave public and etideal untouched).
DROP SCHEMA IF EXISTS etidealcrm CASCADE;
CREATE SCHEMA etidealcrm;
GRANT USAGE ON SCHEMA etidealcrm TO anon, authenticated, service_role, postgres;
