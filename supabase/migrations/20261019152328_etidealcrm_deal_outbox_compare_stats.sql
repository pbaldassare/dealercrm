CREATE OR REPLACE FUNCTION etidealcrm.on_deal_signed(_deal_id uuid)
RETURNS etidealcrm.deal LANGUAGE plpgsql SECURITY DEFINER SET search_path = etidealcrm AS $$
DECLARE rec etidealcrm.deal; listing_row etidealcrm.listing; snapshot jsonb;
BEGIN
  SELECT * INTO rec FROM etidealcrm.deal WHERE id = _deal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'deal not found'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.created_at), '[]'::jsonb) INTO snapshot FROM etidealcrm.deal_item i WHERE i.deal_id = _deal_id;
  UPDATE etidealcrm.deal SET status = 'signed', signed_at = coalesce(signed_at, now()) WHERE id = _deal_id RETURNING * INTO rec;
  PERFORM etidealcrm.change_vehicle_status(rec.vehicle_id, 'sold', jsonb_build_object('deal_id', _deal_id));
  IF rec.lead_id IS NOT NULL THEN
    UPDATE etidealcrm.lead SET deal_id = _deal_id WHERE id = rec.lead_id;
    IF (SELECT status FROM etidealcrm.lead WHERE id = rec.lead_id) NOT IN ('won', 'lost', 'invalid') THEN
      BEGIN
        PERFORM etidealcrm.change_lead_status(rec.lead_id, 'won', jsonb_build_object('deal_id', _deal_id));
      EXCEPTION WHEN OTHERS THEN
        UPDATE etidealcrm.lead SET status = 'won', status_changed_at = now(), status_deadline_at = NULL WHERE id = rec.lead_id;
        INSERT INTO etidealcrm.lead_event (lead_id, actor_kind, type, to_status, payload)
        VALUES (rec.lead_id, 'system', 'status_change', 'won', jsonb_build_object('deal_id', _deal_id, 'forced', true));
      END;
    END IF;
  END IF;
  FOR listing_row IN SELECT * FROM etidealcrm.listing WHERE vehicle_id = rec.vehicle_id LOOP
    INSERT INTO etidealcrm.outbox (dealership_id, integration, action, payload)
    VALUES (rec.dealership_id, listing_row.portal, 'withdraw', jsonb_build_object('listing_id', listing_row.id, 'external_id', listing_row.external_id));
  END LOOP;
  INSERT INTO etidealcrm.outbox (dealership_id, integration, action, payload)
  VALUES (rec.dealership_id, 'contract', 'generate-contract', jsonb_build_object('deal_id', _deal_id));
  INSERT INTO etidealcrm.contract (deal_id, template_version, data, generated_at)
  VALUES (_deal_id, 'draft-1', jsonb_build_object('sale_price', rec.sale_price, 'deposit', rec.deposit, 'items_estimated_snapshot', snapshot, 'frozen_at', now()), now());
  INSERT INTO etidealcrm.notification (user_id, type, payload)
  SELECT p.id, 'deal_signed', jsonb_build_object('deal_id', _deal_id, 'next', ARRAY['transfer_documents','accounting','fi'])
  FROM etidealcrm.profile p WHERE p.dealership_id = rec.dealership_id AND p.role IN ('accounting', 'finance_insurance', 'admin') AND p.is_active;
  RETURN rec;
END;
$$;

CREATE OR REPLACE FUNCTION etidealcrm.process_outbox()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = etidealcrm AS $$
DECLARE r etidealcrm.outbox; n int := 0;
BEGIN
  FOR r IN SELECT * FROM etidealcrm.outbox WHERE status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= now()) FOR UPDATE SKIP LOCKED LOOP
    n := n + 1;
    IF r.action = 'withdraw' AND (r.payload ? 'listing_id') THEN
      UPDATE etidealcrm.listing SET status = 'withdrawn', last_synced_at = now() WHERE id = (r.payload ->> 'listing_id')::uuid;
    END IF;
    UPDATE etidealcrm.outbox SET status = 'sent', attempts = attempts + 1 WHERE id = r.id;
  END LOOP;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION etidealcrm.compare_conditions(_vehicle_id uuid, _from etidealcrm.condition_phase, _to etidealcrm.condition_phase)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = etidealcrm AS $$
DECLARE a etidealcrm.vehicle_condition; b etidealcrm.vehicle_condition; delta int;
BEGIN
  SELECT * INTO a FROM etidealcrm.vehicle_condition WHERE vehicle_id = _vehicle_id AND phase = _from ORDER BY taken_at DESC LIMIT 1;
  SELECT * INTO b FROM etidealcrm.vehicle_condition WHERE vehicle_id = _vehicle_id AND phase = _to ORDER BY taken_at DESC LIMIT 1;
  IF a.id IS NULL OR b.id IS NULL THEN RETURN jsonb_build_object('error', 'missing_phase'); END IF;
  delta := coalesce(b.mileage_km, 0) - coalesce(a.mileage_km, 0);
  RETURN jsonb_build_object(
    'fuel_changed', a.fuel_level IS DISTINCT FROM b.fuel_level,
    'from_fuel', a.fuel_level, 'to_fuel', b.fuel_level,
    'mileage_delta', delta, 'mileage_unjustified', delta > 50,
    'new_damages', (SELECT coalesce(jsonb_agg(jsonb_build_object('zone', d.zone, 'damage_type', d.damage_type, 'severity', d.severity)), '[]'::jsonb) FROM etidealcrm.vehicle_damage d WHERE d.condition_id = b.id AND NOT EXISTS (SELECT 1 FROM etidealcrm.vehicle_damage x WHERE x.condition_id = a.id AND x.zone = d.zone AND x.damage_type = d.damage_type)),
    'repaired_damages', (SELECT coalesce(jsonb_agg(jsonb_build_object('zone', d.zone, 'damage_type', d.damage_type)), '[]'::jsonb) FROM etidealcrm.vehicle_damage d WHERE d.condition_id = b.id AND d.repaired),
    'from_phase', _from, 'to_phase', _to
  );
END;
$$;

CREATE OR REPLACE VIEW etidealcrm.salesperson_stats WITH (security_invoker = true) AS
SELECT p.id AS salesperson_id, p.full_name, p.dealership_id,
  count(l.*) FILTER (WHERE l.assigned_at > now() - interval '30 days') AS leads_received_30,
  count(a.*) FILTER (WHERE a.status IN ('scheduled','confirmed','done')) AS appointments,
  count(l.*) FILTER (WHERE l.status = 'won' AND l.status_changed_at > now() - interval '90 days') AS wins_90,
  CASE WHEN count(*) FILTER (WHERE l.status IN ('won','lost') AND l.status_changed_at > now() - interval '90 days') = 0 THEN 0
    ELSE round(count(*) FILTER (WHERE l.status = 'won' AND l.status_changed_at > now() - interval '90 days')::numeric / count(*) FILTER (WHERE l.status IN ('won','lost') AND l.status_changed_at > now() - interval '90 days'), 3) END AS close_rate_90,
  avg(l.response_minutes) FILTER (WHERE l.response_minutes IS NOT NULL) AS avg_response_minutes
FROM etidealcrm.profile p
LEFT JOIN etidealcrm.lead l ON l.assigned_to = p.id
LEFT JOIN etidealcrm.appointment a ON a.salesperson_id = p.id
WHERE p.role = 'salesperson'
GROUP BY p.id, p.full_name, p.dealership_id;
GRANT SELECT ON etidealcrm.salesperson_stats TO authenticated, service_role;
REVOKE ALL ON etidealcrm.salesperson_stats FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION etidealcrm.compare_conditions(uuid, etidealcrm.condition_phase, etidealcrm.condition_phase) TO authenticated, service_role;
