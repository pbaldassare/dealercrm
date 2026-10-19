CREATE INDEX profile_dealership_id_idx ON etidealcrm.profile (dealership_id);
CREATE INDEX device_user_id_idx ON etidealcrm.device (user_id);
CREATE INDEX setting_dealership_id_idx ON etidealcrm.setting (dealership_id);
CREATE INDEX setting_history_setting_id_idx ON etidealcrm.setting_history (setting_id);
CREATE INDEX supplier_dealership_id_idx ON etidealcrm.supplier (dealership_id);
CREATE INDEX yard_zone_dealership_id_idx ON etidealcrm.yard_zone (dealership_id);
CREATE INDEX yard_slot_zone_id_idx ON etidealcrm.yard_slot (zone_id);
CREATE INDEX vehicle_dealership_id_idx ON etidealcrm.vehicle (dealership_id);
CREATE INDEX vehicle_supplier_id_idx ON etidealcrm.vehicle (supplier_id);
CREATE INDEX vehicle_yard_slot_id_idx ON etidealcrm.vehicle (yard_slot_id);
CREATE INDEX vehicle_status_idx ON etidealcrm.vehicle (dealership_id, status);
CREATE INDEX vehicle_event_vehicle_id_idx ON etidealcrm.vehicle_event (vehicle_id);
CREATE INDEX vehicle_work_vehicle_id_idx ON etidealcrm.vehicle_work (vehicle_id);
CREATE INDEX vehicle_condition_vehicle_id_idx ON etidealcrm.vehicle_condition (vehicle_id);
CREATE INDEX vehicle_damage_condition_id_idx ON etidealcrm.vehicle_damage (condition_id);
CREATE INDEX vehicle_photo_vehicle_id_idx ON etidealcrm.vehicle_photo (vehicle_id);
CREATE INDEX listing_vehicle_id_idx ON etidealcrm.listing (vehicle_id);
CREATE INDEX customer_dealership_id_idx ON etidealcrm.customer (dealership_id);
CREATE UNIQUE INDEX customer_dealership_email_uidx ON etidealcrm.customer (dealership_id, lower(email)) WHERE email IS NOT NULL AND btrim(email) <> '';
CREATE UNIQUE INDEX customer_dealership_phone_uidx ON etidealcrm.customer (dealership_id, phone) WHERE phone IS NOT NULL AND btrim(phone) <> '';
CREATE INDEX lead_dealership_id_idx ON etidealcrm.lead (dealership_id);
CREATE INDEX lead_customer_id_idx ON etidealcrm.lead (customer_id);
CREATE INDEX lead_vehicle_id_idx ON etidealcrm.lead (vehicle_id);
CREATE INDEX lead_assigned_to_idx ON etidealcrm.lead (assigned_to);
CREATE INDEX lead_status_idx ON etidealcrm.lead (dealership_id, status);
CREATE INDEX lead_deadline_idx ON etidealcrm.lead (status_deadline_at) WHERE status_deadline_at IS NOT NULL;
CREATE INDEX lead_event_lead_id_idx ON etidealcrm.lead_event (lead_id);
CREATE INDEX conversation_lead_id_idx ON etidealcrm.conversation (lead_id);
CREATE INDEX appointment_lead_id_idx ON etidealcrm.appointment (lead_id);
CREATE INDEX appointment_salesperson_id_idx ON etidealcrm.appointment (salesperson_id);
CREATE INDEX deal_dealership_id_idx ON etidealcrm.deal (dealership_id);
CREATE INDEX deal_lead_id_idx ON etidealcrm.deal (lead_id);
CREATE INDEX deal_customer_id_idx ON etidealcrm.deal (customer_id);
CREATE INDEX deal_vehicle_id_idx ON etidealcrm.deal (vehicle_id);
CREATE INDEX deal_salesperson_id_idx ON etidealcrm.deal (salesperson_id);
CREATE INDEX deal_item_deal_id_idx ON etidealcrm.deal_item (deal_id);
CREATE INDEX contract_deal_id_idx ON etidealcrm.contract (deal_id);
CREATE INDEX import_job_dealership_id_idx ON etidealcrm.import_job (dealership_id);
CREATE INDEX import_row_job_id_idx ON etidealcrm.import_row (job_id);
CREATE INDEX outbox_status_idx ON etidealcrm.outbox (status, next_attempt_at);
CREATE INDEX notification_user_id_idx ON etidealcrm.notification (user_id);
CREATE INDEX message_template_dealership_id_idx ON etidealcrm.message_template (dealership_id);

CREATE OR REPLACE FUNCTION etidealcrm.normalize_vehicle_plate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.plate := upper(regexp_replace(coalesce(NEW.plate, ''), '\s+', '', 'g'));
  IF NEW.plate !~ '^[A-Z]{2}[0-9]{3}[A-Z]{2}$' THEN
    RAISE EXCEPTION 'invalid plate % (expected Italian format AA999AA)', NEW.plate;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER vehicle_normalize_plate BEFORE INSERT OR UPDATE OF plate ON etidealcrm.vehicle FOR EACH ROW EXECUTE FUNCTION etidealcrm.normalize_vehicle_plate();

CREATE OR REPLACE FUNCTION etidealcrm.enforce_max_authorized_devices() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'authorized' THEN
    IF (SELECT count(*) FROM etidealcrm.device d WHERE d.user_id = NEW.user_id AND d.status = 'authorized' AND d.id IS DISTINCT FROM NEW.id) >= 2 THEN
      RAISE EXCEPTION 'maximum of 2 authorized devices per user';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER device_max_authorized BEFORE INSERT OR UPDATE OF status ON etidealcrm.device FOR EACH ROW EXECUTE FUNCTION etidealcrm.enforce_max_authorized_devices();

CREATE OR REPLACE FUNCTION etidealcrm.record_setting_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.value IS DISTINCT FROM OLD.value THEN
    INSERT INTO etidealcrm.setting_history (setting_id, old_value, new_value, changed_by)
    VALUES (NEW.id, OLD.value, NEW.value, NEW.updated_by);
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER setting_write_history BEFORE UPDATE ON etidealcrm.setting FOR EACH ROW EXECUTE FUNCTION etidealcrm.record_setting_history();
