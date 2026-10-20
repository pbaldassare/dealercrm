-- Fase 2 veicoli: check delle condizioni con revisione IA, lavorazioni senza costi per chi non deve vederli, allerte.

-- Arrivo previsto (allerta "in arrivo oltre la data") e revisione IA del check (VisionAdapter)
ALTER TABLE dealercrm.vehicle ADD COLUMN expected_arrival date;
ALTER TABLE dealercrm.vehicle_condition ADD COLUMN ai_review jsonb;

-- Ogni check scrive un evento nello storico del veicolo
CREATE FUNCTION dealercrm.on_condition_created() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = dealercrm, pg_temp AS $$
BEGIN
  INSERT INTO dealercrm.vehicle_event (vehicle_id, actor_id, type, payload)
  VALUES (NEW.vehicle_id, auth.uid(), 'condition', jsonb_build_object('condition_id', NEW.id, 'phase', NEW.phase, 'mileage_km', NEW.mileage_km));
  RETURN NEW;
END $$;
CREATE TRIGGER condition_after_insert AFTER INSERT ON dealercrm.vehicle_condition FOR EACH ROW EXECUTE FUNCTION dealercrm.on_condition_created();

-- Lavorazioni: la tabella con i costi la leggono solo i ruoli dei costi; tutti gli altri passano dalla vista senza costo.
-- (Prima chi non vedeva i costi perdeva di vista una lavorazione appena le si dava un costo.)
DROP POLICY sel ON dealercrm.vehicle_work;
CREATE POLICY sel ON dealercrm.vehicle_work FOR SELECT TO authenticated
  USING (dealercrm.vehicle_visible(vehicle_id) AND (SELECT dealercrm.has_role('admin','owner','sales_manager','used_manager','accounting','finance_insurance')));
DROP POLICY wr ON dealercrm.vehicle_work;
CREATE POLICY wr ON dealercrm.vehicle_work FOR ALL TO authenticated
  USING (dealercrm.vehicle_visible(vehicle_id) AND (SELECT dealercrm.has_role('admin','used_manager')))
  WITH CHECK (dealercrm.vehicle_visible(vehicle_id) AND (SELECT dealercrm.has_role('admin','used_manager')));

CREATE VIEW dealercrm.vehicle_work_list WITH (security_barrier = true) AS
SELECT w.id, w.vehicle_id, w.kind, w.status, w.started_at, w.ended_at, w.notes, w.created_at,
       CASE WHEN dealercrm.has_role('admin','owner','sales_manager','used_manager','accounting','finance_insurance') THEN w.cost END AS cost
FROM dealercrm.vehicle_work w
WHERE dealercrm.vehicle_visible(w.vehicle_id);
REVOKE ALL ON dealercrm.vehicle_work_list FROM PUBLIC, anon;
GRANT SELECT ON dealercrm.vehicle_work_list TO authenticated;
GRANT ALL ON dealercrm.vehicle_work_list TO service_role;

-- Inserisce o aggiorna una lavorazione (usato, ricondizionamento, admin) e la scrive nello storico.
-- Il ricondizionamento può indicare il costo ma non lo rilegge; _cost NULL in modifica lascia il costo com'è.
CREATE FUNCTION dealercrm.save_vehicle_work(_id uuid, _vehicle_id uuid, _kind dealercrm.vehicle_work_kind, _status dealercrm.vehicle_work_status,
  _cost numeric DEFAULT NULL, _notes text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = dealercrm, pg_temp AS $$
DECLARE wid uuid; prev dealercrm.vehicle_work;
BEGIN
  IF NOT (dealercrm.has_role('admin','used_manager','reconditioning') AND dealercrm.vehicle_visible(_vehicle_id)) THEN
    RAISE EXCEPTION 'non autorizzato' USING ERRCODE = '42501';
  END IF;
  IF _cost IS NOT NULL AND _cost < 0 THEN RAISE EXCEPTION 'il costo non può essere negativo'; END IF;
  IF _id IS NULL THEN
    INSERT INTO dealercrm.vehicle_work (vehicle_id, kind, status, cost, notes, started_at, ended_at)
    VALUES (_vehicle_id, _kind, _status, _cost, nullif(btrim(_notes), ''),
            CASE WHEN _status <> 'planned' THEN now() END, CASE WHEN _status = 'done' THEN now() END)
    RETURNING id INTO wid;
  ELSE
    SELECT * INTO prev FROM dealercrm.vehicle_work WHERE id = _id AND vehicle_id = _vehicle_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'lavorazione non trovata'; END IF;
    UPDATE dealercrm.vehicle_work SET kind = _kind, status = _status, cost = coalesce(_cost, cost), notes = nullif(btrim(_notes), ''),
      started_at = CASE WHEN _status <> 'planned' THEN coalesce(started_at, now()) END,
      ended_at = CASE WHEN _status = 'done' THEN coalesce(ended_at, now()) END
    WHERE id = _id RETURNING id INTO wid;
    IF prev.status = _status THEN RETURN wid; END IF;
  END IF;
  INSERT INTO dealercrm.vehicle_event (vehicle_id, actor_id, type, payload)
  VALUES (_vehicle_id, auth.uid(), 'work', jsonb_build_object('work_id', wid, 'kind', _kind, 'status', _status));
  RETURN wid;
END $$;
REVOKE ALL ON FUNCTION dealercrm.save_vehicle_work(uuid, uuid, dealercrm.vehicle_work_kind, dealercrm.vehicle_work_status, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION dealercrm.save_vehicle_work(uuid, uuid, dealercrm.vehicle_work_kind, dealercrm.vehicle_work_status, numeric, text) TO authenticated, service_role;

-- Allerte sui veicoli (sezione 6), soglie in setting.vehicle_alerts. Una riga per allerta attiva.
CREATE VIEW dealercrm.vehicle_alert WITH (security_barrier = true) AS
WITH cfg AS (
  SELECT d.id AS dealership_id, coalesce(s.value, '{}'::jsonb) AS c
  FROM dealercrm.dealership d LEFT JOIN dealercrm.setting s ON s.dealership_id = d.id AND s.key = 'vehicle_alerts'
), v AS (
  SELECT v.*, c.c, extract(epoch FROM now() - v.status_changed_at) / 86400 AS days_in_status,
         greatest(0, current_date - coalesce(v.entry_date, v.created_at::date)) AS days_in_stock
  FROM dealercrm.vehicle v JOIN cfg c ON c.dealership_id = v.dealership_id
  WHERE v.dealership_id = dealercrm.my_dealership() AND dealercrm.my_role() IS NOT NULL
)
SELECT v.id AS vehicle_id, v.plate, v.make, v.model, v.status, a.code, a.severity, a.message, a.days
FROM v
CROSS JOIN LATERAL (VALUES
  ('incoming_late', 'warn', 'In arrivo oltre la data prevista', current_date - v.expected_arrival,
     v.status = 'incoming' AND v.expected_arrival < current_date AND coalesce((v.c ->> 'incoming_past_eta')::boolean, true)),
  ('intake_missing', 'bad', 'Check di ingresso non fatto', floor(v.days_in_status)::int,
     v.status = 'received' AND v.status_changed_at < now() - make_interval(hours => coalesce((v.c ->> 'received_intake_hours')::int, 24))
     AND NOT EXISTS (SELECT 1 FROM dealercrm.vehicle_condition k WHERE k.vehicle_id = v.id AND k.phase = 'intake')),
  ('reconditioning_long', 'warn', 'In lavorazione da troppo tempo', floor(v.days_in_status)::int,
     v.status = 'reconditioning' AND v.days_in_status > coalesce((v.c ->> 'reconditioning_days')::int, 10)),
  ('ready_not_published', 'warn', 'Pronta ma non pubblicata', floor(v.days_in_status)::int,
     v.status = 'ready' AND v.days_in_status > coalesce((v.c ->> 'ready_publish_days')::int, 2)),
  ('published_markdown', 'bad', 'In stock da oltre 90 giorni: valutare un ribasso', v.days_in_stock,
     v.status = 'published' AND v.days_in_stock > coalesce((v.c ->> 'published_markdown_days')::int, 90)),
  ('published_long', 'warn', 'In stock da oltre 60 giorni', v.days_in_stock,
     v.status = 'published' AND v.days_in_stock > coalesce((v.c ->> 'published_warn_days')::int, 60)
     AND v.days_in_stock <= coalesce((v.c ->> 'published_markdown_days')::int, 90)),
  ('reserved_no_contract', 'warn', 'Riservata senza contratto firmato', floor(v.days_in_status)::int,
     v.status = 'reserved' AND v.days_in_status > coalesce((v.c ->> 'reserved_days')::int, 10)),
  ('transfer_not_started', 'warn', 'Venduta: passaggio di proprietà non avviato', floor(v.days_in_status)::int,
     v.status = 'sold' AND EXISTS (SELECT 1 FROM dealercrm.deal d WHERE d.vehicle_id = v.id AND d.status IN ('signed','payment_pending'))),
  ('delivering_long', 'warn', 'In consegna da troppo tempo', floor(v.days_in_status)::int,
     v.status = 'delivering' AND v.days_in_status > coalesce((v.c ->> 'delivering_days')::int, 7)),
  ('withdrawn_long', 'muted', 'Ritirata da tempo', floor(v.days_in_status)::int,
     v.status = 'withdrawn' AND v.days_in_status > coalesce((v.c ->> 'withdrawn_days')::int, 30))
) AS a(code, severity, message, days, active)
WHERE a.active;
REVOKE ALL ON dealercrm.vehicle_alert FROM PUBLIC, anon;
GRANT SELECT ON dealercrm.vehicle_alert TO authenticated;
GRANT ALL ON dealercrm.vehicle_alert TO service_role;

NOTIFY pgrst, 'reload schema';
