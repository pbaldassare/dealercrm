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
  SELECT coalesce(v.sale_price, v.list_price, 0) INTO vehicle_value FROM etidealcrm.vehicle v WHERE v.id = rec.vehicle_id;
  band := coalesce(rec.price_band, etidealcrm.lead_price_band(vehicle_value));
  SELECT s.value INTO weights FROM etidealcrm.setting s WHERE s.dealership_id = rec.dealership_id AND s.key = 'assignment_weights';
  SELECT s.value INTO params FROM etidealcrm.setting s WHERE s.dealership_id = rec.dealership_id AND s.key = 'assignment_params';
  weights := coalesce(weights, '{"performance":0.4,"rotation":0.4,"load":0.2}'::jsonb);
  params := coalesce(params, '{"max_open_leads":15,"min_share":0.08,"max_hot_share":0.25,"band_d_top_n":3}'::jsonb);
  SELECT count(*) INTO total_30 FROM etidealcrm.lead WHERE dealership_id = rec.dealership_id AND assigned_at > now() - interval '30 days';
  SELECT count(*) INTO hot_30 FROM etidealcrm.lead WHERE dealership_id = rec.dealership_id AND assigned_at > now() - interval '30 days' AND temperature = 'hot';
  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY close_rate) INTO median_rate FROM (
    SELECT CASE WHEN tot = 0 THEN 0 ELSE won::numeric / tot END AS close_rate FROM (
      SELECT p.id,
        count(*) FILTER (WHERE l.status IN ('won','lost') AND l.status_changed_at > now() - interval '90 days') AS tot,
        count(*) FILTER (WHERE l.status = 'won' AND l.status_changed_at > now() - interval '90 days') AS won
      FROM etidealcrm.profile p LEFT JOIN etidealcrm.lead l ON l.assigned_to = p.id
      WHERE p.dealership_id = rec.dealership_id AND p.role = 'salesperson' AND p.is_active GROUP BY p.id) s) m;
  SELECT l.assigned_to INTO chosen FROM etidealcrm.lead l JOIN etidealcrm.profile p ON p.id = l.assigned_to
  WHERE l.customer_id = rec.customer_id AND l.id <> rec.id AND p.is_active AND p.is_available AND p.role = 'salesperson' AND band = ANY (p.enabled_bands)
  ORDER BY l.assigned_at DESC NULLS LAST LIMIT 1;
  IF chosen IS NULL THEN
    WITH stats AS (
      SELECT p.id,
        count(*) FILTER (WHERE l.status NOT IN ('won','lost','invalid')) AS open_cnt,
        count(*) FILTER (WHERE l.assigned_at > now() - interval '30 days') AS received_30,
        count(*) FILTER (WHERE l.status = 'won' AND l.status_changed_at > now() - interval '90 days') AS won90,
        count(*) FILTER (WHERE l.status IN ('won','lost') AND l.status_changed_at > now() - interval '90 days') AS closed90,
        count(*) FILTER (WHERE l.temperature = 'hot' AND l.assigned_at > now() - interval '30 days') AS hot_cnt
      FROM etidealcrm.profile p LEFT JOIN etidealcrm.lead l ON l.assigned_to = p.id
      WHERE p.dealership_id = rec.dealership_id AND p.role = 'salesperson' AND p.is_active AND p.is_available AND band = ANY (p.enabled_bands)
      GROUP BY p.id
    ), scored AS (
      SELECT s.*, CASE WHEN closed90 = 0 THEN 0 ELSE won90::numeric / closed90 END AS close_rate,
        CASE WHEN total_30 = 0 THEN 0 ELSE received_30::numeric / total_30 END AS share_30,
        (coalesce(weights->>'performance','0.4')::numeric) * least(100, greatest(0, (CASE WHEN closed90 = 0 THEN 0 ELSE won90::numeric / closed90 END) * 100))
        + (coalesce(weights->>'rotation','0.4')::numeric) * (100 - least(100, received_30 * 4))
        + (coalesce(weights->>'load','0.2')::numeric) * (100 - least(100, open_cnt * 100 / greatest(1, coalesce((params->>'max_open_leads')::int, 15)))) AS score
      FROM stats s
      WHERE s.open_cnt < coalesce((params->>'max_open_leads')::int, 15)
        AND (band IN ('A','B') OR (band = 'C' AND (CASE WHEN s.closed90 = 0 THEN 0 ELSE s.won90::numeric / s.closed90 END) >= coalesce(median_rate, 0)) OR band = 'D')
        AND (rec.temperature IS DISTINCT FROM 'hot' OR s.hot_cnt = 0 OR hot_30 = 0 OR (s.hot_cnt::numeric / greatest(hot_30,1)) <= coalesce((params->>'max_hot_share')::numeric, 0.25))
    )
    SELECT id INTO chosen FROM scored
    WHERE band <> 'D' OR id IN (SELECT id FROM scored ORDER BY close_rate DESC, score DESC LIMIT coalesce((params->>'band_d_top_n')::int, 3))
    ORDER BY CASE WHEN share_30 < coalesce((params->>'min_share')::numeric, 0.08) THEN 0 ELSE 1 END, score DESC, received_30 ASC LIMIT 1;
  END IF;
  IF chosen IS NULL THEN
    SELECT p.id INTO chosen FROM etidealcrm.profile p WHERE p.dealership_id = rec.dealership_id AND p.role = 'sales_manager' AND p.is_active LIMIT 1;
  END IF;
  reason := jsonb_build_object('strategy','spec_weighted','band',band,'vehicle_value',vehicle_value,'chosen',chosen,'median_close_rate',median_rate,'weights',weights,'fairness',jsonb_build_object('total_30',total_30,'hot_30',hot_30));
  UPDATE etidealcrm.lead SET assigned_to = chosen, assigned_at = now(), price_band = band, assignment_reason = reason,
    reassignment_count = CASE WHEN rec.assigned_to IS NOT NULL AND rec.assigned_to IS DISTINCT FROM chosen THEN rec.reassignment_count + 1 ELSE rec.reassignment_count END
  WHERE id = _lead_id RETURNING * INTO rec;
  IF rec.status = 'qualified' THEN
    rec := etidealcrm.change_lead_status(_lead_id, 'assigned', jsonb_build_object('assigned_to', chosen));
  END IF;
  RETURN rec;
END;
$$;
