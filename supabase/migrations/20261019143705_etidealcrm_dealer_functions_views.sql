CREATE OR REPLACE FUNCTION etidealcrm.set_vehicle_yard_position(_vehicle_id uuid, _slot_id uuid, _yard_status etidealcrm.yard_status) RETURNS etidealcrm.vehicle LANGUAGE plpgsql SECURITY DEFINER SET search_path = etidealcrm AS $$
DECLARE rec etidealcrm.vehicle;
BEGIN
  IF NOT (etidealcrm.can_write_yard() OR etidealcrm.can_write_vehicles()) THEN RAISE EXCEPTION 'not allowed to update yard position'; END IF;
  IF NOT etidealcrm.vehicle_in_current_dealership(_vehicle_id) THEN RAISE EXCEPTION 'vehicle not found'; END IF;
  UPDATE etidealcrm.vehicle SET yard_slot_id = _slot_id, yard_status = _yard_status, yard_verified_at = now(), yard_verified_by = auth.uid() WHERE id = _vehicle_id RETURNING * INTO rec;
  INSERT INTO etidealcrm.vehicle_event (vehicle_id, actor_id, type, payload) VALUES (_vehicle_id, auth.uid(), 'yard_position', jsonb_build_object('slot_id', _slot_id, 'yard_status', _yard_status));
  RETURN rec;
END; $$;

CREATE OR REPLACE FUNCTION etidealcrm.lead_timer_minutes(_status etidealcrm.lead_status, _channel etidealcrm.lead_channel) RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = etidealcrm AS $$
DECLARE timers jsonb;
BEGIN
  SELECT s.value -> 'timers_min' INTO timers FROM etidealcrm.setting s WHERE s.dealership_id = etidealcrm.current_dealership_id() AND s.key = 'lead_timers';
  IF timers IS NULL THEN timers := '{"new":2,"qualified":5,"assigned":15,"contacted":2880,"visited":1440,"proposal_sent":4320,"negotiating":10080}'::jsonb; END IF;
  IF _status = 'ai_qualifying' THEN IF _channel = 'voicemail' THEN RETURN 10; END IF; RETURN 1440; END IF;
  IF timers ? _status::text THEN RETURN (timers ->> _status::text)::integer; END IF;
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION etidealcrm.change_lead_status(_lead_id uuid, _to_status etidealcrm.lead_status, _payload jsonb DEFAULT '{}'::jsonb) RETURNS etidealcrm.lead LANGUAGE plpgsql SECURITY DEFINER SET search_path = etidealcrm AS $$
DECLARE rec etidealcrm.lead; prev etidealcrm.lead_status; allowed etidealcrm.lead_status[]; mins integer;
BEGIN
  SELECT * INTO rec FROM etidealcrm.lead WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'lead not found'; END IF;
  prev := rec.status;
  allowed := CASE prev
    WHEN 'new' THEN ARRAY['ai_qualifying','invalid']::etidealcrm.lead_status[]
    WHEN 'ai_qualifying' THEN ARRAY['qualified','invalid']::etidealcrm.lead_status[]
    WHEN 'qualified' THEN ARRAY['assigned']::etidealcrm.lead_status[]
    WHEN 'assigned' THEN ARRAY['contacted']::etidealcrm.lead_status[]
    WHEN 'contacted' THEN ARRAY['appointment_set','lost']::etidealcrm.lead_status[]
    WHEN 'appointment_set' THEN ARRAY['visited','lost','contacted']::etidealcrm.lead_status[]
    WHEN 'visited' THEN ARRAY['proposal_sent','lost']::etidealcrm.lead_status[]
    WHEN 'proposal_sent' THEN ARRAY['negotiating','lost']::etidealcrm.lead_status[]
    WHEN 'negotiating' THEN ARRAY['won','lost']::etidealcrm.lead_status[]
    ELSE ARRAY[]::etidealcrm.lead_status[] END;
  IF NOT (_to_status = ANY (allowed)) THEN RAISE EXCEPTION 'invalid lead transition % -> %', prev, _to_status; END IF;
  IF _to_status = 'lost' AND coalesce(_payload ->> 'lost_reason', rec.lost_reason::text) IS NULL THEN RAISE EXCEPTION 'lost_reason required'; END IF;
  mins := etidealcrm.lead_timer_minutes(_to_status, rec.channel);
  UPDATE etidealcrm.lead SET status = _to_status, status_changed_at = now(),
    status_deadline_at = CASE WHEN mins IS NULL THEN NULL ELSE now() + make_interval(mins => mins) END,
    lost_reason = CASE WHEN _to_status = 'lost' THEN coalesce((_payload ->> 'lost_reason')::etidealcrm.lost_reason, lost_reason) ELSE lost_reason END
  WHERE id = _lead_id RETURNING * INTO rec;
  INSERT INTO etidealcrm.lead_event (lead_id, actor_id, actor_kind, type, from_status, to_status, payload)
  VALUES (_lead_id, auth.uid(), CASE WHEN auth.uid() IS NULL THEN 'system' ELSE 'user' END, 'status_change', prev, _to_status, coalesce(_payload, '{}'::jsonb));
  RETURN rec;
END; $$;

CREATE OR REPLACE FUNCTION etidealcrm.change_vehicle_status(_vehicle_id uuid, _to_status etidealcrm.vehicle_status, _payload jsonb DEFAULT '{}'::jsonb) RETURNS etidealcrm.vehicle LANGUAGE plpgsql SECURITY DEFINER SET search_path = etidealcrm AS $$
DECLARE rec etidealcrm.vehicle; prev etidealcrm.vehicle_status;
BEGIN
  SELECT * INTO rec FROM etidealcrm.vehicle WHERE id = _vehicle_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'vehicle not found'; END IF;
  prev := rec.status;
  UPDATE etidealcrm.vehicle SET status = _to_status, status_changed_at = now() WHERE id = _vehicle_id RETURNING * INTO rec;
  INSERT INTO etidealcrm.vehicle_event (vehicle_id, actor_id, type, from_status, to_status, payload)
  VALUES (_vehicle_id, auth.uid(), 'status_change', prev, _to_status, coalesce(_payload, '{}'::jsonb));
  RETURN rec;
END; $$;

CREATE OR REPLACE FUNCTION etidealcrm.assign_lead(_lead_id uuid) RETURNS etidealcrm.lead LANGUAGE plpgsql SECURITY DEFINER SET search_path = etidealcrm AS $$
DECLARE rec etidealcrm.lead; chosen uuid;
BEGIN
  SELECT * INTO rec FROM etidealcrm.lead WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'lead not found'; END IF;
  SELECT p.id INTO chosen FROM etidealcrm.profile p WHERE p.dealership_id = rec.dealership_id AND p.role = 'salesperson' AND p.is_active AND p.is_available
  ORDER BY (SELECT count(*) FROM etidealcrm.lead l WHERE l.assigned_to = p.id AND l.status NOT IN ('won','lost','invalid')) ASC, p.full_name LIMIT 1;
  IF chosen IS NULL THEN SELECT p.id INTO chosen FROM etidealcrm.profile p WHERE p.dealership_id = rec.dealership_id AND p.role = 'sales_manager' AND p.is_active LIMIT 1; END IF;
  UPDATE etidealcrm.lead SET assigned_to = chosen, assigned_at = now(), assignment_reason = jsonb_build_object('strategy','stub_least_open_leads','chosen', chosen) WHERE id = _lead_id RETURNING * INTO rec;
  IF rec.status = 'qualified' THEN rec := etidealcrm.change_lead_status(_lead_id, 'assigned', jsonb_build_object('assigned_to', chosen)); END IF;
  RETURN rec;
END; $$;

CREATE OR REPLACE FUNCTION etidealcrm.on_deal_signed(_deal_id uuid) RETURNS etidealcrm.deal LANGUAGE plpgsql SECURITY DEFINER SET search_path = etidealcrm AS $$
DECLARE rec etidealcrm.deal; listing_row etidealcrm.listing;
BEGIN
  SELECT * INTO rec FROM etidealcrm.deal WHERE id = _deal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'deal not found'; END IF;
  UPDATE etidealcrm.deal SET status = 'signed', signed_at = coalesce(signed_at, now()) WHERE id = _deal_id RETURNING * INTO rec;
  PERFORM etidealcrm.change_vehicle_status(rec.vehicle_id, 'sold', jsonb_build_object('deal_id', _deal_id));
  IF rec.lead_id IS NOT NULL THEN
    UPDATE etidealcrm.lead SET deal_id = _deal_id WHERE id = rec.lead_id;
    IF (SELECT status FROM etidealcrm.lead WHERE id = rec.lead_id) NOT IN ('won','lost','invalid') THEN
      BEGIN PERFORM etidealcrm.change_lead_status(rec.lead_id, 'won', jsonb_build_object('deal_id', _deal_id));
      EXCEPTION WHEN OTHERS THEN
        UPDATE etidealcrm.lead SET status = 'won', status_changed_at = now(), status_deadline_at = NULL WHERE id = rec.lead_id;
        INSERT INTO etidealcrm.lead_event (lead_id, actor_kind, type, to_status, payload) VALUES (rec.lead_id, 'system', 'status_change', 'won', jsonb_build_object('deal_id', _deal_id, 'forced', true));
      END;
    END IF;
  END IF;
  FOR listing_row IN SELECT * FROM etidealcrm.listing WHERE vehicle_id = rec.vehicle_id LOOP
    INSERT INTO etidealcrm.outbox (dealership_id, integration, action, payload) VALUES (rec.dealership_id, listing_row.portal, 'withdraw', jsonb_build_object('listing_id', listing_row.id, 'external_id', listing_row.external_id));
  END LOOP;
  INSERT INTO etidealcrm.notification (user_id, type, payload)
  SELECT p.id, 'deal_signed', jsonb_build_object('deal_id', _deal_id) FROM etidealcrm.profile p
  WHERE p.dealership_id = rec.dealership_id AND p.role IN ('accounting','finance_insurance','admin') AND p.is_active;
  RETURN rec;
END; $$;

GRANT EXECUTE ON FUNCTION etidealcrm.change_lead_status(uuid, etidealcrm.lead_status, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION etidealcrm.change_vehicle_status(uuid, etidealcrm.vehicle_status, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION etidealcrm.assign_lead(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION etidealcrm.on_deal_signed(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION etidealcrm.set_vehicle_yard_position(uuid, uuid, etidealcrm.yard_status) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION etidealcrm.vehicle_in_current_dealership(uuid) TO authenticated, service_role;

CREATE VIEW etidealcrm.vehicle_stock WITH (security_invoker = true) AS
SELECT v.id, v.dealership_id, v.plate, v.vin, v.make, v.model, v.trim, v.kind, v.status, v.list_price, v.sale_price, v.purchase_cost, v.entry_date, v.is_demo,
  GREATEST(0, (CURRENT_DATE - coalesce(v.entry_date, v.created_at::date)))::integer AS days_in_stock,
  coalesce((SELECT sum(w.cost) FROM etidealcrm.vehicle_work w WHERE w.vehicle_id = v.id), 0)::numeric(12,2) AS reconditioning_cost
FROM etidealcrm.vehicle v;

CREATE VIEW etidealcrm.vehicle_public WITH (security_barrier = true) AS
SELECT v.id, v.dealership_id, v.plate, v.vin, v.make, v.model, v.trim, v.kind, v.body_type, v.first_registration, v.mileage_km, v.fuel_type, v.gearbox, v.power_kw, v.color, v.emission_class, v.previous_owners, v.supplier_id, v.list_price, v.sale_price, v.entry_date, v.status, v.status_changed_at, v.yard_slot_id, v.yard_status, v.yard_verified_at, v.notes, v.is_demo, v.created_at,
  GREATEST(0, (CURRENT_DATE - coalesce(v.entry_date, v.created_at::date)))::integer AS days_in_stock
FROM etidealcrm.vehicle v
WHERE v.dealership_id = etidealcrm.current_dealership_id() AND etidealcrm.is_active_user() AND etidealcrm.can_read_vehicles();

CREATE VIEW etidealcrm.deal_margin WITH (security_invoker = true) AS
SELECT d.id AS deal_id, d.dealership_id, d.vehicle_id, d.status, d.sale_price,
  coalesce(sum(CASE WHEN i.kind = 'revenue' THEN coalesce(i.estimated, 0) ELSE 0 END), 0) AS estimated_revenue,
  coalesce(sum(CASE WHEN i.kind = 'cost' THEN coalesce(i.estimated, 0) ELSE 0 END), 0) AS estimated_cost,
  coalesce(sum(CASE WHEN i.kind = 'revenue' THEN coalesce(i.actual, i.estimated, 0) ELSE 0 END), 0) AS actual_revenue,
  coalesce(sum(CASE WHEN i.kind = 'cost' THEN coalesce(i.actual, i.estimated, 0) ELSE 0 END), 0) AS actual_cost,
  coalesce(sum(CASE WHEN i.kind = 'revenue' THEN coalesce(i.estimated, 0) ELSE 0 END), 0) - coalesce(sum(CASE WHEN i.kind = 'cost' THEN coalesce(i.estimated, 0) ELSE 0 END), 0) AS estimated_margin,
  coalesce(sum(CASE WHEN i.kind = 'revenue' THEN coalesce(i.actual, i.estimated, 0) ELSE 0 END), 0) - coalesce(sum(CASE WHEN i.kind = 'cost' THEN coalesce(i.actual, i.estimated, 0) ELSE 0 END), 0) AS actual_margin
FROM etidealcrm.deal d LEFT JOIN etidealcrm.deal_item i ON i.deal_id = d.id GROUP BY d.id;

CREATE VIEW etidealcrm.lead_open WITH (security_invoker = true) AS
SELECT l.*, CASE WHEN l.status_deadline_at IS NULL THEN NULL ELSE extract(epoch FROM (l.status_deadline_at - now()))::integer END AS remaining_seconds
FROM etidealcrm.lead l WHERE l.status NOT IN ('won','lost','invalid');
