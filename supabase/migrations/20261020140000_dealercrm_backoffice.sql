-- Backoffice: dati anagrafici e fiscali del cliente, statistiche dei fornitori, azioni sugli annunci dei portali.

-- Cliente: i campi che servono al contratto (sezione 10) e alla fattura elettronica (sezione 13)
ALTER TABLE dealercrm.customer
  ADD COLUMN tax_code text,
  ADD COLUMN vat_number text,
  ADD COLUMN birth_date date,
  ADD COLUMN birth_place text,
  ADD COLUMN id_document text,
  ADD COLUMN address_street text,
  ADD COLUMN address_postal_code text,
  ADD COLUMN address_province text,
  ADD COLUMN ei_code text,
  ADD COLUMN certified_email text,
  ADD COLUMN notes text;

-- Fornitori: auto fornite, vendute, tempo medio di vendita e margine medio (sezione 6). Rispetta la RLS di chi legge.
CREATE VIEW dealercrm.supplier_stats WITH (security_invoker = true) AS
SELECT s.id AS supplier_id, s.dealership_id,
  count(DISTINCT v.id) AS vehicles,
  count(DISTINCT v.id) FILTER (WHERE v.status IN ('sold','delivering','delivered')) AS sold,
  count(DISTINCT v.id) FILTER (WHERE v.status NOT IN ('sold','delivering','delivered','withdrawn')) AS in_stock,
  round(avg(d.signed_at::date - v.entry_date) FILTER (WHERE d.signed_at IS NOT NULL AND v.entry_date IS NOT NULL)) AS avg_days_to_sell,
  round(avg(coalesce(m.actual_margin, m.estimated_margin))) AS avg_margin
FROM dealercrm.supplier s
LEFT JOIN dealercrm.vehicle v ON v.supplier_id = s.id
LEFT JOIN dealercrm.deal d ON d.vehicle_id = v.id AND d.status <> 'cancelled'
LEFT JOIN dealercrm.deal_margin m ON m.deal_id = d.id
GROUP BY s.id, s.dealership_id;
REVOKE ALL ON dealercrm.supplier_stats FROM PUBLIC, anon;
GRANT SELECT ON dealercrm.supplier_stats TO authenticated;
GRANT ALL ON dealercrm.supplier_stats TO service_role;

-- Annunci: pubblica, sospendi o ritira passando dall'outbox (adattatori finti finché FEATURE_PORTALS_REAL è spento).
-- Pubblicare un'auto "pronta" la porta a "pubblicata".
CREATE FUNCTION dealercrm.queue_listing_action(_listing_id uuid, _action text)
RETURNS dealercrm.outbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path = dealercrm, pg_temp AS $$
DECLARE l dealercrm.listing; v dealercrm.vehicle; o dealercrm.outbox;
BEGIN
  IF _action NOT IN ('publish','suspend','withdraw') THEN RAISE EXCEPTION 'azione non valida: %', _action; END IF;
  SELECT * INTO l FROM dealercrm.listing WHERE id = _listing_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'annuncio non trovato'; END IF;
  SELECT * INTO v FROM dealercrm.vehicle WHERE id = l.vehicle_id;
  IF auth.uid() IS NOT NULL AND NOT (dealercrm.has_role('admin','used_manager','marketing') AND v.dealership_id = dealercrm.my_dealership()) THEN
    RAISE EXCEPTION 'non autorizzato' USING ERRCODE = '42501';
  END IF;
  IF _action = 'publish' AND v.status NOT IN ('ready','published','reserved') THEN
    RAISE EXCEPTION 'si pubblicano solo auto pronte (stato attuale: %)', v.status;
  END IF;
  IF _action = 'publish' THEN
    UPDATE dealercrm.listing SET status = 'publishing', last_error = NULL WHERE id = _listing_id;
  END IF;
  INSERT INTO dealercrm.outbox (dealership_id, integration, action, payload, dedup_key)
  VALUES (v.dealership_id, l.portal, _action, jsonb_build_object('listing_id', l.id, 'external_id', l.external_id),
          l.portal || ':' || _action || ':' || l.id || ':' || floor(extract(epoch FROM now()))::bigint)
  ON CONFLICT (dedup_key) DO NOTHING
  RETURNING * INTO o;
  IF _action = 'publish' AND v.status = 'ready' THEN
    PERFORM dealercrm._set_vehicle_status(v.id, 'published', jsonb_build_object('listing_id', l.id));
  END IF;
  RETURN o;
END $$;
REVOKE ALL ON FUNCTION dealercrm.queue_listing_action(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION dealercrm.queue_listing_action(uuid, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
