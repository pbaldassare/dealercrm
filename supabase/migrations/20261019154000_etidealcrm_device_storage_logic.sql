-- Device RLS as spec, fairness on assign_lead, on_deal_signed extras,
-- salesperson_stats, storage buckets, enabled bands.

ALTER TABLE etidealcrm.profile
  ADD COLUMN IF NOT EXISTS enabled_bands text[] NOT NULL DEFAULT ARRAY['A','B'];

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

CREATE OR REPLACE FUNCTION etidealcrm.protect_device_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = etidealcrm
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT etidealcrm.has_role('admin') THEN
    RAISE EXCEPTION 'only admin can change device status';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_device_status ON etidealcrm.device;
CREATE TRIGGER trg_protect_device_status
  BEFORE UPDATE ON etidealcrm.device
  FOR EACH ROW EXECUTE FUNCTION etidealcrm.protect_device_status();

DROP POLICY IF EXISTS device_update ON etidealcrm.device;
CREATE POLICY device_update_admin ON etidealcrm.device
  FOR UPDATE TO authenticated
  USING ((SELECT etidealcrm.can_manage_users()))
  WITH CHECK ((SELECT etidealcrm.can_manage_users()));
CREATE POLICY device_update_own ON etidealcrm.device
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION etidealcrm.can_read_leads()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = etidealcrm AS $$
  SELECT etidealcrm.is_device_authorized() AND etidealcrm.has_role(
    'admin','owner','sales_manager','salesperson','used_manager',
    'accounting','finance_insurance','marketing'
  );
$$;
CREATE OR REPLACE FUNCTION etidealcrm.can_write_all_leads()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = etidealcrm AS $$
  SELECT etidealcrm.is_device_authorized() AND etidealcrm.has_role('admin','sales_manager');
$$;
CREATE OR REPLACE FUNCTION etidealcrm.can_read_vehicles()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = etidealcrm AS $$
  SELECT etidealcrm.is_device_authorized() AND etidealcrm.has_role(
    'admin','owner','sales_manager','salesperson','used_manager',
    'reconditioning','yard','accounting','finance_insurance','marketing'
  );
$$;
CREATE OR REPLACE FUNCTION etidealcrm.can_write_vehicles()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = etidealcrm AS $$
  SELECT etidealcrm.is_device_authorized() AND etidealcrm.has_role('admin','used_manager');
$$;
CREATE OR REPLACE FUNCTION etidealcrm.can_read_costs()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = etidealcrm AS $$
  SELECT etidealcrm.is_device_authorized() AND etidealcrm.has_role(
    'admin','owner','sales_manager','used_manager','accounting','finance_insurance'
  );
$$;
CREATE OR REPLACE FUNCTION etidealcrm.can_write_conditions()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = etidealcrm AS $$
  SELECT etidealcrm.is_device_authorized() AND etidealcrm.has_role('admin','used_manager','reconditioning','yard');
$$;
CREATE OR REPLACE FUNCTION etidealcrm.can_write_work()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = etidealcrm AS $$
  SELECT etidealcrm.is_device_authorized() AND etidealcrm.has_role('admin','used_manager','reconditioning');
$$;
CREATE OR REPLACE FUNCTION etidealcrm.can_write_listings()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = etidealcrm AS $$
  SELECT etidealcrm.is_device_authorized() AND etidealcrm.has_role('admin','used_manager','marketing');
$$;
CREATE OR REPLACE FUNCTION etidealcrm.can_read_deals()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = etidealcrm AS $$
  SELECT etidealcrm.is_device_authorized() AND etidealcrm.has_role(
    'admin','owner','sales_manager','salesperson','used_manager',
    'accounting','finance_insurance'
  );
$$;
CREATE OR REPLACE FUNCTION etidealcrm.can_write_all_deals()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = etidealcrm AS $$
  SELECT etidealcrm.is_device_authorized() AND etidealcrm.has_role('admin','sales_manager','accounting','finance_insurance');
$$;
CREATE OR REPLACE FUNCTION etidealcrm.can_write_suppliers()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = etidealcrm AS $$
  SELECT etidealcrm.is_device_authorized() AND etidealcrm.has_role('admin','used_manager');
$$;
CREATE OR REPLACE FUNCTION etidealcrm.can_read_suppliers()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = etidealcrm AS $$
  SELECT etidealcrm.is_device_authorized() AND etidealcrm.has_role(
    'admin','owner','sales_manager','used_manager','accounting'
  );
$$;
CREATE OR REPLACE FUNCTION etidealcrm.can_write_yard()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = etidealcrm AS $$
  SELECT etidealcrm.is_device_authorized() AND etidealcrm.has_role('admin','yard');
$$;
CREATE OR REPLACE FUNCTION etidealcrm.can_read_yard()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = etidealcrm AS $$
  SELECT etidealcrm.is_device_authorized() AND etidealcrm.has_role(
    'admin','owner','sales_manager','salesperson','used_manager','reconditioning','yard'
  );
$$;
CREATE OR REPLACE FUNCTION etidealcrm.can_manage_users()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = etidealcrm AS $$
  SELECT etidealcrm.has_role('admin');
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
  total_30 int;
  hot_30 int;
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

  SELECT count(*) INTO total_30 FROM etidealcrm.lead
  WHERE dealership_id = rec.dealership_id AND assigned_at > now() - interval '30 days';
  SELECT count(*) INTO hot_30 FROM etidealcrm.lead
  WHERE dealership_id = rec.dealership_id AND assigned_at > now() - interval '30 days' AND temperature = 'hot';

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

  SELECT l.assigned_to INTO chosen
  FROM etidealcrm.lead l
  JOIN etidealcrm.profile p ON p.id = l.assigned_to
  WHERE l.customer_id = rec.customer_id
    AND l.id <> rec.id
    AND p.is_active AND p.is_available AND p.role = 'salesperson'
    AND band = ANY (p.enabled_bands)
  ORDER BY l.assigned_at DESC NULLS LAST
  LIMIT 1;

  IF chosen IS NULL THEN
    WITH stats AS (
      SELECT p.id,
        count(*) FILTER (WHERE l.status NOT IN ('won','lost','invalid')) AS open_cnt,
        count(*) FILTER (WHERE l.assigned_at > now() - interval '30 days') AS received_30,
        count(*) FILTER (WHERE l.status = 'won' AND l.status_changed_at > now() - interval '90 days') AS won90,
        count(*) FILTER (WHERE l.status IN ('won','lost') AND l.status_changed_at > now() - interval '90 days') AS closed90,
        count(*) FILTER (WHERE l.temperature = 'hot' AND l.assigned_at > now() - interval '30 days') AS hot_cnt
      FROM etidealcrm.profile p
      LEFT JOIN etidealcrm.lead l ON l.assigned_to = p.id
      WHERE p.dealership_id = rec.dealership_id
        AND p.role = 'salesperson' AND p.is_active AND p.is_available
        AND band = ANY (p.enabled_bands)
      GROUP BY p.id
    ),
    scored AS (
      SELECT s.*,
        CASE WHEN closed90 = 0 THEN 0 ELSE won90::numeric / closed90 END AS close_rate,
        CASE WHEN total_30 = 0 THEN 0 ELSE received_30::numeric / total_30 END AS share_30,
        CASE WHEN hot_30 = 0 THEN 0 ELSE hot_cnt::numeric / hot_30 END AS hot_share,
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
        AND (
          rec.temperature IS DISTINCT FROM 'hot'
          OR s.hot_cnt = 0
          OR (hot_30 = 0)
          OR (s.hot_cnt::numeric / greatest(hot_30,1)) <= coalesce((params->>'max_hot_share')::numeric, 0.25)
        )
    )
    SELECT id INTO chosen
    FROM scored
    WHERE band <> 'D' OR id IN (
      SELECT id FROM scored ORDER BY close_rate DESC, score DESC LIMIT coalesce((params->>'band_d_top_n')::int, 3)
    )
    ORDER BY
      CASE WHEN share_30 < coalesce((params->>'min_share')::numeric, 0.08) THEN 0 ELSE 1 END,
      score DESC,
      received_30 ASC
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
    'weights', weights,
    'fairness', jsonb_build_object('total_30', total_30, 'hot_30', hot_30)
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

CREATE OR REPLACE FUNCTION etidealcrm.on_deal_signed(_deal_id uuid)
RETURNS etidealcrm.deal
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = etidealcrm
AS $$
DECLARE
  rec etidealcrm.deal;
  listing_row etidealcrm.listing;
  snapshot jsonb;
BEGIN
  SELECT * INTO rec FROM etidealcrm.deal WHERE id = _deal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'deal not found'; END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.created_at), '[]'::jsonb) INTO snapshot
  FROM etidealcrm.deal_item i WHERE i.deal_id = _deal_id;

  UPDATE etidealcrm.deal
  SET status = 'signed', signed_at = coalesce(signed_at, now())
  WHERE id = _deal_id
  RETURNING * INTO rec;

  PERFORM etidealcrm.change_vehicle_status(rec.vehicle_id, 'sold', jsonb_build_object('deal_id', _deal_id));

  IF rec.lead_id IS NOT NULL THEN
    UPDATE etidealcrm.lead SET deal_id = _deal_id WHERE id = rec.lead_id;
    IF (SELECT status FROM etidealcrm.lead WHERE id = rec.lead_id) NOT IN ('won', 'lost', 'invalid') THEN
      BEGIN
        PERFORM etidealcrm.change_lead_status(rec.lead_id, 'won', jsonb_build_object('deal_id', _deal_id));
      EXCEPTION WHEN OTHERS THEN
        UPDATE etidealcrm.lead
        SET status = 'won', status_changed_at = now(), status_deadline_at = NULL
        WHERE id = rec.lead_id;
        INSERT INTO etidealcrm.lead_event (lead_id, actor_kind, type, to_status, payload)
        VALUES (rec.lead_id, 'system', 'status_change', 'won', jsonb_build_object('deal_id', _deal_id, 'forced', true));
      END;
    END IF;
  END IF;

  FOR listing_row IN SELECT * FROM etidealcrm.listing WHERE vehicle_id = rec.vehicle_id LOOP
    INSERT INTO etidealcrm.outbox (dealership_id, integration, action, payload)
    VALUES (
      rec.dealership_id,
      listing_row.portal,
      'withdraw',
      jsonb_build_object('listing_id', listing_row.id, 'external_id', listing_row.external_id)
    );
  END LOOP;

  INSERT INTO etidealcrm.outbox (dealership_id, integration, action, payload)
  VALUES (rec.dealership_id, 'contract', 'generate-contract', jsonb_build_object('deal_id', _deal_id));

  INSERT INTO etidealcrm.contract (deal_id, template_version, data, generated_at)
  VALUES (
    _deal_id,
    'draft-1',
    jsonb_build_object(
      'sale_price', rec.sale_price,
      'deposit', rec.deposit,
      'items_estimated_snapshot', snapshot,
      'frozen_at', now()
    ),
    now()
  );

  INSERT INTO etidealcrm.notification (user_id, type, payload)
  SELECT p.id, 'deal_signed', jsonb_build_object('deal_id', _deal_id, 'next', ARRAY['transfer_documents','accounting','fi'])
  FROM etidealcrm.profile p
  WHERE p.dealership_id = rec.dealership_id
    AND p.role IN ('accounting', 'finance_insurance', 'admin')
    AND p.is_active;

  RETURN rec;
END;
$$;

CREATE OR REPLACE FUNCTION etidealcrm.process_outbox()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = etidealcrm
AS $$
DECLARE
  r etidealcrm.outbox;
  n int := 0;
BEGIN
  FOR r IN
    SELECT * FROM etidealcrm.outbox
    WHERE status = 'pending'
      AND (next_attempt_at IS NULL OR next_attempt_at <= now())
    FOR UPDATE SKIP LOCKED
  LOOP
    n := n + 1;
    IF r.action = 'withdraw' AND (r.payload ? 'listing_id') THEN
      UPDATE etidealcrm.listing
      SET status = 'withdrawn', last_synced_at = now()
      WHERE id = (r.payload ->> 'listing_id')::uuid;
    END IF;
    UPDATE etidealcrm.outbox
    SET status = 'sent', attempts = attempts + 1
    WHERE id = r.id;
  END LOOP;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION etidealcrm.compare_conditions(
  _vehicle_id uuid,
  _from etidealcrm.condition_phase,
  _to etidealcrm.condition_phase
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = etidealcrm
AS $$
DECLARE
  a etidealcrm.vehicle_condition;
  b etidealcrm.vehicle_condition;
  delta int;
BEGIN
  SELECT * INTO a FROM etidealcrm.vehicle_condition
  WHERE vehicle_id = _vehicle_id AND phase = _from ORDER BY taken_at DESC LIMIT 1;
  SELECT * INTO b FROM etidealcrm.vehicle_condition
  WHERE vehicle_id = _vehicle_id AND phase = _to ORDER BY taken_at DESC LIMIT 1;
  IF a.id IS NULL OR b.id IS NULL THEN
    RETURN jsonb_build_object('error', 'missing_phase');
  END IF;
  delta := coalesce(b.mileage_km, 0) - coalesce(a.mileage_km, 0);
  RETURN jsonb_build_object(
    'fuel_changed', a.fuel_level IS DISTINCT FROM b.fuel_level,
    'from_fuel', a.fuel_level,
    'to_fuel', b.fuel_level,
    'mileage_delta', delta,
    'mileage_unjustified', delta > 50,
    'new_damages', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('zone', d.zone, 'damage_type', d.damage_type, 'severity', d.severity)), '[]'::jsonb)
      FROM etidealcrm.vehicle_damage d
      WHERE d.condition_id = b.id
        AND NOT EXISTS (
          SELECT 1 FROM etidealcrm.vehicle_damage x
          WHERE x.condition_id = a.id AND x.zone = d.zone AND x.damage_type = d.damage_type
        )
    ),
    'repaired_damages', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('zone', d.zone, 'damage_type', d.damage_type)), '[]'::jsonb)
      FROM etidealcrm.vehicle_damage d
      WHERE d.condition_id = b.id AND d.repaired
    ),
    'from_phase', _from,
    'to_phase', _to
  );
END;
$$;

CREATE OR REPLACE VIEW etidealcrm.salesperson_stats
WITH (security_invoker = true) AS
SELECT
  p.id AS salesperson_id,
  p.full_name,
  p.dealership_id,
  count(l.*) FILTER (WHERE l.assigned_at > now() - interval '30 days') AS leads_received_30,
  count(a.*) FILTER (WHERE a.status IN ('scheduled','confirmed','done')) AS appointments,
  count(l.*) FILTER (WHERE l.status = 'won' AND l.status_changed_at > now() - interval '90 days') AS wins_90,
  CASE
    WHEN count(*) FILTER (WHERE l.status IN ('won','lost') AND l.status_changed_at > now() - interval '90 days') = 0 THEN 0
    ELSE round(
      count(*) FILTER (WHERE l.status = 'won' AND l.status_changed_at > now() - interval '90 days')::numeric
      / count(*) FILTER (WHERE l.status IN ('won','lost') AND l.status_changed_at > now() - interval '90 days'),
      3)
  END AS close_rate_90,
  avg(l.response_minutes) FILTER (WHERE l.response_minutes IS NOT NULL) AS avg_response_minutes
FROM etidealcrm.profile p
LEFT JOIN etidealcrm.lead l ON l.assigned_to = p.id
LEFT JOIN etidealcrm.appointment a ON a.salesperson_id = p.id
WHERE p.role = 'salesperson'
GROUP BY p.id, p.full_name, p.dealership_id;

GRANT SELECT ON etidealcrm.salesperson_stats TO authenticated, service_role;
REVOKE ALL ON etidealcrm.salesperson_stats FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION etidealcrm.compare_conditions(uuid, etidealcrm.condition_phase, etidealcrm.condition_phase) TO authenticated, service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('vehicle-photos', 'vehicle-photos', false, 10485760, ARRAY['image/jpeg','image/png','image/webp']::text[]),
  ('documents', 'documents', false, 20971520, ARRAY['application/pdf','image/jpeg','image/png']::text[]),
  ('imports', 'imports', false, 20971520, ARRAY['text/csv','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']::text[]),
  ('call-audio', 'call-audio', false, 20971520, ARRAY['audio/mpeg','audio/wav','audio/webm']::text[])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS etidealcrm_vehicle_photos ON storage.objects;
DROP POLICY IF EXISTS etidealcrm_documents ON storage.objects;
DROP POLICY IF EXISTS etidealcrm_imports ON storage.objects;
DROP POLICY IF EXISTS etidealcrm_call_audio ON storage.objects;

CREATE POLICY etidealcrm_vehicle_photos ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'vehicle-photos' AND etidealcrm.is_device_authorized())
  WITH CHECK (bucket_id = 'vehicle-photos' AND etidealcrm.is_device_authorized());
CREATE POLICY etidealcrm_documents ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'documents' AND etidealcrm.is_device_authorized())
  WITH CHECK (bucket_id = 'documents' AND etidealcrm.is_device_authorized());
CREATE POLICY etidealcrm_imports ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'imports' AND etidealcrm.is_device_authorized())
  WITH CHECK (bucket_id = 'imports' AND etidealcrm.is_device_authorized());
CREATE POLICY etidealcrm_call_audio ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'call-audio' AND etidealcrm.is_device_authorized() AND etidealcrm.has_role('admin','sales_manager'))
  WITH CHECK (bucket_id = 'call-audio' AND etidealcrm.is_device_authorized() AND etidealcrm.has_role('admin','sales_manager'));
