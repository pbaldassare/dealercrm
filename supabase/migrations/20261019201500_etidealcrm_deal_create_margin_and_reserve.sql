SET search_path = etidealcrm, public, extensions;

-- Alla creazione della pratica: voce vehicle_margin stimata (prezzo - costo - ricondizionamento)
-- e, se c'è caparra, veicolo in stato reserved (sezione 6 della specifica).
CREATE OR REPLACE FUNCTION etidealcrm.on_deal_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = etidealcrm AS $$
DECLARE cost numeric; recond numeric; price numeric; vstatus etidealcrm.vehicle_status;
BEGIN
  SELECT v.purchase_cost, v.status INTO cost, vstatus FROM etidealcrm.vehicle v WHERE v.id = NEW.vehicle_id;
  SELECT coalesce(sum(w.cost), 0) INTO recond FROM etidealcrm.vehicle_work w WHERE w.vehicle_id = NEW.vehicle_id;
  price := coalesce(NEW.sale_price, (SELECT coalesce(v.sale_price, v.list_price) FROM etidealcrm.vehicle v WHERE v.id = NEW.vehicle_id), 0);
  INSERT INTO etidealcrm.deal_item (deal_id, type, kind, estimated, status, source)
  VALUES (NEW.id, 'vehicle_margin', 'revenue', price - coalesce(cost, 0) - recond, 'planned', 'auto');
  IF coalesce(NEW.deposit, 0) > 0 AND vstatus IN ('ready', 'published') THEN
    PERFORM etidealcrm.change_vehicle_status(NEW.vehicle_id, 'reserved', jsonb_build_object('deal_id', NEW.id));
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER deal_after_insert AFTER INSERT ON etidealcrm.deal FOR EACH ROW EXECUTE FUNCTION etidealcrm.on_deal_created();

-- Caparra aggiunta dopo: stessa regola
CREATE OR REPLACE FUNCTION etidealcrm.on_deal_deposit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = etidealcrm AS $$
DECLARE vstatus etidealcrm.vehicle_status;
BEGIN
  IF coalesce(NEW.deposit, 0) > 0 AND coalesce(OLD.deposit, 0) = 0 THEN
    SELECT status INTO vstatus FROM etidealcrm.vehicle WHERE id = NEW.vehicle_id;
    IF vstatus IN ('ready', 'published') THEN PERFORM etidealcrm.change_vehicle_status(NEW.vehicle_id, 'reserved', jsonb_build_object('deal_id', NEW.id)); END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER deal_after_update_deposit AFTER UPDATE OF deposit ON etidealcrm.deal FOR EACH ROW EXECUTE FUNCTION etidealcrm.on_deal_deposit();
