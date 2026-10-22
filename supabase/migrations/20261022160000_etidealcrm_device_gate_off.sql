-- Device binding off until Paolo turns it back on. Keep table `device`.
-- Repo identifiers stay on schema etidealcrm. Live moyfkdwsghidkcifesrg currently
-- holds dealer data in dealercrm (migration drop_etidealcrm). Apply the bypass
-- on whichever of those schemas exists.
-- Active users pass RLS without an authorized install.

DO $m$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'etidealcrm') THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION etidealcrm.is_device_authorized()
      RETURNS boolean
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = etidealcrm
      AS $body$ SELECT etidealcrm.is_active_user(); $body$;
    $fn$;
    EXECUTE 'GRANT EXECUTE ON FUNCTION etidealcrm.is_device_authorized() TO authenticated, service_role';
    EXECUTE 'REVOKE ALL ON FUNCTION etidealcrm.is_device_authorized() FROM PUBLIC, anon';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'dealercrm') THEN
    -- Live gate is device_ok(), used by my_role() and my_dealership().
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION dealercrm.device_ok()
      RETURNS boolean
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path TO 'dealercrm', 'pg_temp'
      AS $body$
        SELECT EXISTS (
          SELECT 1 FROM dealercrm.profile p
          WHERE p.id = auth.uid() AND p.is_active
        );
      $body$;
    $fn$;
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION dealercrm.is_device_authorized()
      RETURNS boolean
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path TO 'dealercrm', 'pg_temp'
      AS $body$ SELECT dealercrm.device_ok(); $body$;
    $fn$;
    EXECUTE 'GRANT EXECUTE ON FUNCTION dealercrm.device_ok() TO authenticated, service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION dealercrm.is_device_authorized() TO authenticated, service_role';
    EXECUTE 'REVOKE ALL ON FUNCTION dealercrm.device_ok() FROM PUBLIC, anon';
    EXECUTE 'REVOKE ALL ON FUNCTION dealercrm.is_device_authorized() FROM PUBLIC, anon';
  END IF;
END
$m$;
