-- Full assign_lead, timers, outbox mock worker, tighter device helper.

CREATE OR REPLACE FUNCTION etidealcrm.is_device_authorized()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = etidealcrm
AS $$
DECLARE
  hdr json;
  install text;
BEGIN
  IF NOT etidealcrm.is_active_user() THEN
    RETURN false;
  END IF;
  IF etidealcrm.has_role('admin') THEN
    RETURN true;
  END IF;
  BEGIN
    hdr := current_setting('request.headers', true)::json;
  EXCEPTION WHEN OTHERS THEN
    hdr := NULL;
  END;
  install := NULLIF(btrim(coalesce(hdr ->> 'x-device-id', '')), '');
  IF install IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM etidealcrm.device d
    WHERE d.user_id = (SELECT auth.uid())
      AND d.install_id = install
      AND d.status = 'authorized'
  );
END;
$$;

CREATE OR REPLACE FUNCTION etidealcrm.lead_price_band(_value numeric)
RETURNS char
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN coalesce(_value, 0) < 10000 THEN 'A'
    WHEN _value < 20000 THEN 'B'
    WHEN _value < 35000 THEN 'C'
    ELSE 'D'
  END;
$$;

CREATE OR REPLACE FUNCTION etidealcrm.assign_lead(_lead_id uuid)
RETURNS etidealcrm.lead
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = etidealcrm
AS $$
DECLARE
  rec etidealcrm.lead;
  vehicle_value numeric;
  band char(1);
  weights jsonb;
  params jsonb;
  chosen uuid;
  reason jsonb;
  median_rate numeric;
BEGIN
  SELECT * INTO rec FROM etidealcrm.lead WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'lead not found'; END IF;

  SELECT coalesce(v.sale_price, v.list_price, 0) INTO vehicle_value
  FROM etidealcrm.vehicle v WHERE v.id = rec.vehicle_id;
  band := coalesce(rec.price_band, etidealcrm.lead_price_band(vehicle_value));

  SELECT s.value INTO weights FROM etidealcrm.setting s
  WHERE s.dealership_id = rec.dealership_id AND s.key = 'assignment_weights';
  SELECT s.value INTO params FROM etidealcrm.setting s
  WHERE s.dealership_id = rec.dealership_id AND s.key = 'assignment_params';
  weights := coalesce(weights, '{"performance":0.4,"rotation":0.4,"load":0.2}'::jsonb);
  params := coalesce(params, '{"max_open_leads":15,"min_share":0.08,"max_hot_share":0.25,"band_d_top_n":3}'::jsonb);

  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY close_rate) INTO median_rate
  FROM (
    SELECT CASE WHEN tot = 0 THEN 0 ELSE won::numeric / tot END AS close_rate
    FROM (
      SELECT p.id,
        count(*) FILTER (WHERE l.status IN ('won','lost') AND l.status_changed_at > now() - interval '90 days') AS tot,
        count(*) FILTER (WHERE l.status = 'won' AND l.status_changed_at > now() - interval '90 days') AS won
      FROM etidealcrm.profile p
      LEFT JOIN etidealcrm.lead l ON l.assigned_to = p.id
      WHERE p.dealership_id = rec.dealership_id AND p.role = 'salesperson' AND p.is_active
      GROUP BY p.id
    ) s
  ) m;

  -- continuity
  SELECT l.assigned_to INTO chosen
  FROM etidealcrm.lead l
  JOIN etidealcrm.profile p ON p.id = l.assigned_to
  WHERE l.customer_id = rec.customer_id
    AND l.id <> rec.id
    AND p.is_active AND p.is_available AND p.role = 'salesperson'
  ORDER BY l.assigned_at DESC NULLS LAST
  LIMIT 1;

  IF chosen IS NULL THEN
    WITH stats AS (
      SELECT p.id,
        count(*) FILTER (WHERE l.status NOT IN ('won','lost','invalid')) AS open_cnt,
        count(*) FILTER (WHERE l.created_at > now() - interval '30 days') AS received_30,
        count(*) FILTER (WHERE l.status = 'won' AND l.status_changed_at > now() - interval '90 days') AS won90,
        count(*) FILTER (WHERE l.status IN ('won','lost') AND l.status_changed_at > now() - interval '90 days') AS closed90,
        coalesce(avg(l.response_minutes) FILTER (WHERE l.response_minutes IS NOT NULL), 15) AS avg_resp
      FROM etidealcrm.profile p
      LEFT JOIN etidealcrm.lead l ON l.assigned_to = p.id
      WHERE p.dealership_id = rec.dealership_id
        AND p.role = 'salesperson' AND p.is_active AND p.is_available
      GROUP BY p.id
    ),
    scored AS (
      SELECT s.*,
        CASE WHEN closed90 = 0 THEN 0 ELSE won90::numeric / closed90 END AS close_rate,
        (coalesce(weights->>'performance','0.4')::numeric) *
          least(100, greatest(0, (CASE WHEN closed90 = 0 THEN 0 ELSE won90::numeric / closed90 END) * 100))
        + (coalesce(weights->>'rotation','0.4')::numeric) *
          (100 - least(100, received_30 * 4))
        + (coalesce(weights->>'load','0.2')::numeric) *
          (100 - least(100, open_cnt * 100 / greatest(1, coalesce((params->>'max_open_leads')::int, 15))))
        AS score
      FROM stats s
      WHERE s.open_cnt < coalesce((params->>'max_open_leads')::int, 15)
        AND (
          band IN ('A','B')
          OR (band = 'C' AND (CASE WHEN s.closed90 = 0 THEN 0 ELSE s.won90::numeric / s.closed90 END) >= coalesce(median_rate, 0))
          OR band = 'D'
        )
    )
    SELECT id INTO chosen
    FROM scored
    WHERE band <> 'D' OR id IN (
      SELECT id FROM scored ORDER BY close_rate DESC, score DESC LIMIT coalesce((params->>'band_d_top_n')::int, 3)
    )
    ORDER BY score DESC, received_30 ASC
    LIMIT 1;
  END IF;

  IF chosen IS NULL THEN
    SELECT p.id INTO chosen FROM etidealcrm.profile p
    WHERE p.dealership_id = rec.dealership_id AND p.role = 'sales_manager' AND p.is_active
    LIMIT 1;
  END IF;

  reason := jsonb_build_object(
    'strategy', 'spec_weighted',
    'band', band,
    'vehicle_value', vehicle_value,
    'chosen', chosen,
    'median_close_rate', median_rate,
    'weights', weights
  );

  UPDATE etidealcrm.lead
  SET assigned_to = chosen,
      assigned_at = now(),
      price_band = band,
      assignment_reason = reason,
      reassignment_count = CASE WHEN rec.assigned_to IS NOT NULL AND rec.assigned_to IS DISTINCT FROM chosen
        THEN rec.reassignment_count + 1 ELSE rec.reassignment_count END
  WHERE id = _lead_id
  RETURNING * INTO rec;

  IF rec.status = 'qualified' THEN
    rec := etidealcrm.change_lead_status(_lead_id, 'assigned', jsonb_build_object('assigned_to', chosen));
  END IF;
  RETURN rec;
END;
$$;

CREATE OR REPLACE FUNCTION etidealcrm.process_lead_timers()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = etidealcrm
AS $$
DECLARE
  r etidealcrm.lead;
  n int := 0;
  elapsed int;
BEGIN
  FOR r IN
    SELECT * FROM etidealcrm.lead
    WHERE status NOT IN ('won','lost','invalid')
      AND (
        (status_deadline_at IS NOT NULL AND status_deadline_at < now())
        OR (status_changed_at < now() - interval '30 days')
      )
  LOOP
    n := n + 1;
    IF r.status_changed_at < now() - interval '30 days' THEN
      BEGIN
        PERFORM etidealcrm.change_lead_status(r.id, 'lost', '{"lost_reason":"no_response"}'::jsonb);
      EXCEPTION WHEN OTHERS THEN
        UPDATE etidealcrm.lead SET status = 'lost', lost_reason = 'no_response', status_changed_at = now()
        WHERE id = r.id;
      END;
      CONTINUE;
    END IF;

    IF r.status = 'qualified' THEN
      PERFORM etidealcrm.assign_lead(r.id);
    ELSIF r.status = 'new' THEN
      INSERT INTO etidealcrm.notification (user_id, type, payload)
      SELECT p.id, 'lead_timer', jsonb_build_object('lead_id', r.id, 'status', r.status)
      FROM etidealcrm.profile p
      WHERE p.dealership_id = r.dealership_id AND p.role IN ('sales_manager','admin') AND p.is_active;
    ELSIF r.status = 'assigned' THEN
      elapsed := extract(epoch FROM (now() - r.status_changed_at))::int / 60;
      IF elapsed >= 60 AND r.reassignment_count < 3 THEN
        PERFORM etidealcrm.assign_lead(r.id);
      ELSE
        INSERT INTO etidealcrm.notification (user_id, type, payload)
        SELECT p.id, 'lead_escalation', jsonb_build_object('lead_id', r.id, 'elapsed_min', elapsed)
        FROM etidealcrm.profile p
        WHERE p.id = CASE WHEN elapsed >= 30 THEN (
          SELECT id FROM etidealcrm.profile WHERE dealership_id = r.dealership_id AND role = 'sales_manager' AND is_active LIMIT 1
        ) ELSE r.assigned_to END;
      END IF;
    ELSE
      INSERT INTO etidealcrm.notification (user_id, type, payload)
      SELECT coalesce(r.assigned_to, p.id), 'lead_reminder', jsonb_build_object('lead_id', r.id, 'status', r.status)
      FROM etidealcrm.profile p
      WHERE p.dealership_id = r.dealership_id AND p.role = 'sales_manager' AND p.is_active
      LIMIT 1;
    END IF;
  END LOOP;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION etidealcrm.process_outbox()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = etidealcrm
AS $$
DECLARE n int;
BEGIN
  UPDATE etidealcrm.outbox
  SET status = 'sent', attempts = attempts + 1
  WHERE status = 'pending'
    AND (next_attempt_at IS NULL OR next_attempt_at <= now());
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION etidealcrm.compare_conditions(
  _vehicle_id uuid,
  _from etidealcrm.condition_phase,
  _to etidealcrm.condition_phase
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = etidealcrm
AS $$
  SELECT jsonb_build_object(
    'fuel_changed', a.fuel_level IS DISTINCT FROM b.fuel_level,
    'mileage_delta', coalesce(b.mileage_km, 0) - coalesce(a.mileage_km, 0),
    'from_phase', _from,
    'to_phase', _to
  )
  FROM etidealcrm.vehicle_condition a
  JOIN etidealcrm.vehicle_condition b ON b.vehicle_id = a.vehicle_id
  WHERE a.vehicle_id = _vehicle_id AND a.phase = _from AND b.phase = _to
  ORDER BY a.taken_at DESC, b.taken_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION etidealcrm.assign_lead(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION etidealcrm.process_lead_timers() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION etidealcrm.process_outbox() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION etidealcrm.compare_conditions(uuid, etidealcrm.condition_phase, etidealcrm.condition_phase) TO authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname LIKE 'etidealcrm-%';
    PERFORM cron.schedule('etidealcrm-lead-timers', '* * * * *', 'SELECT etidealcrm.process_lead_timers()');
    PERFORM cron.schedule('etidealcrm-outbox', '* * * * *', 'SELECT etidealcrm.process_outbox()');
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
