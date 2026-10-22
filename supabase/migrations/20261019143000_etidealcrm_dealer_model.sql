-- Overwrite schema etidealcrm with the dealer-management model (spec §3–4).
-- Does not drop or alter schemas public or etideal.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DROP SCHEMA IF EXISTS etidealcrm CASCADE;
CREATE SCHEMA etidealcrm;

GRANT USAGE ON SCHEMA etidealcrm TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA etidealcrm TO postgres;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE etidealcrm.app_role AS ENUM (
  'admin', 'owner', 'sales_manager', 'salesperson', 'used_manager',
  'reconditioning', 'yard', 'accounting', 'finance_insurance', 'marketing'
);

CREATE TYPE etidealcrm.lead_channel AS ENUM (
  'autoscout24', 'other_portal', 'website', 'whatsapp', 'voicemail',
  'phone', 'facebook', 'instagram', 'walk_in'
);

CREATE TYPE etidealcrm.lead_status AS ENUM (
  'new', 'ai_qualifying', 'qualified', 'assigned', 'contacted',
  'appointment_set', 'visited', 'proposal_sent', 'negotiating',
  'won', 'lost', 'invalid'
);

CREATE TYPE etidealcrm.lead_temperature AS ENUM ('hot', 'warm', 'cold', 'invalid');

CREATE TYPE etidealcrm.vehicle_status AS ENUM (
  'incoming', 'received', 'reconditioning', 'ready', 'published',
  'reserved', 'sold', 'delivering', 'delivered', 'withdrawn'
);

CREATE TYPE etidealcrm.yard_status AS ENUM ('in_yard', 'workshop', 'test_drive', 'off_site');

CREATE TYPE etidealcrm.vehicle_kind AS ENUM ('new', 'km0', 'used');

CREATE TYPE etidealcrm.body_type AS ENUM (
  'city_car', 'sedan', 'station_wagon', 'suv', 'minivan', 'coupe', 'other'
);

CREATE TYPE etidealcrm.supplier_type AS ENUM (
  'private', 'customer_trade_in', 'auction', 'dealer', 'import', 'rental_company'
);

CREATE TYPE etidealcrm.deal_status AS ENUM (
  'open', 'quote_sent', 'contract_pending', 'signed', 'payment_pending',
  'transfer_documents', 'delivered', 'closed', 'cancelled'
);

CREATE TYPE etidealcrm.deal_item_type AS ENUM (
  'vehicle_margin', 'financing_interest', 'insurance', 'cvt', 'gps',
  'etching', 'extended_warranty', 'fees', 'discount', 'salesperson_commission',
  'other_cost'
);

CREATE TYPE etidealcrm.deal_item_status AS ENUM ('planned', 'confirmed', 'collected');

CREATE TYPE etidealcrm.condition_phase AS ENUM ('intake', 'during', 'delivery');

CREATE TYPE etidealcrm.fuel_level AS ENUM (
  'empty', 'quarter', 'half', 'three_quarters', 'full'
);

CREATE TYPE etidealcrm.damage_type AS ENUM ('scratch', 'dent', 'break', 'wear');

CREATE TYPE etidealcrm.severity AS ENUM ('light', 'medium', 'severe');

CREATE TYPE etidealcrm.listing_status AS ENUM (
  'to_publish', 'publishing', 'published', 'error', 'withdrawn', 'suspended'
);

CREATE TYPE etidealcrm.device_status AS ENUM ('pending', 'authorized', 'revoked');

CREATE TYPE etidealcrm.appointment_status AS ENUM (
  'scheduled', 'confirmed', 'done', 'no_show', 'cancelled'
);

CREATE TYPE etidealcrm.outbox_status AS ENUM ('pending', 'sent', 'failed');

CREATE TYPE etidealcrm.vehicle_work_kind AS ENUM (
  'bodywork', 'mechanical', 'cleaning', 'documents'
);

CREATE TYPE etidealcrm.vehicle_work_status AS ENUM ('planned', 'in_progress', 'done');

CREATE TYPE etidealcrm.purchase_type AS ENUM ('cash', 'financing', 'trade_in');

CREATE TYPE etidealcrm.urgency AS ENUM ('low', 'medium', 'high');

CREATE TYPE etidealcrm.actor_kind AS ENUM ('user', 'system', 'ai');

CREATE TYPE etidealcrm.message_direction AS ENUM ('in', 'out');

CREATE TYPE etidealcrm.deal_item_kind AS ENUM ('revenue', 'cost');

CREATE TYPE etidealcrm.conclusion_type AS ENUM ('on_premises', 'distance', 'off_premises');

CREATE TYPE etidealcrm.import_kind AS ENUM ('vehicles', 'leads', 'customers', 'suppliers');

CREATE TYPE etidealcrm.import_job_status AS ENUM (
  'pending', 'preview', 'importing', 'done', 'failed'
);

CREATE TYPE etidealcrm.import_row_status AS ENUM (
  'pending', 'valid', 'skipped', 'duplicate', 'error'
);

CREATE TYPE etidealcrm.lost_reason AS ENUM (
  'price_too_high', 'vehicle_sold', 'chose_competitor', 'no_response',
  'financing_denied', 'trade_in_not_accepted', 'changed_mind', 'other'
);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE etidealcrm.dealership (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  vat_number text,
  address text,
  timezone text NOT NULL DEFAULT 'Europe/Rome',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE etidealcrm.profile (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  dealership_id uuid NOT NULL REFERENCES etidealcrm.dealership (id),
  full_name text NOT NULL,
  role etidealcrm.app_role NOT NULL,
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  is_available boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE etidealcrm.device (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES etidealcrm.profile (id) ON DELETE CASCADE,
  install_id text NOT NULL UNIQUE,
  name text,
  status etidealcrm.device_status NOT NULL DEFAULT 'pending',
  requested_at timestamptz NOT NULL DEFAULT now(),
  authorized_by uuid REFERENCES etidealcrm.profile (id),
  authorized_at timestamptz,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE etidealcrm.setting (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealership_id uuid NOT NULL REFERENCES etidealcrm.dealership (id),
  key text NOT NULL,
  value jsonb NOT NULL,
  updated_by uuid REFERENCES etidealcrm.profile (id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dealership_id, key)
);

CREATE TABLE etidealcrm.setting_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_id uuid NOT NULL REFERENCES etidealcrm.setting (id) ON DELETE CASCADE,
  old_value jsonb,
  new_value jsonb NOT NULL,
  changed_by uuid REFERENCES etidealcrm.profile (id),
  changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE etidealcrm.supplier (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealership_id uuid NOT NULL REFERENCES etidealcrm.dealership (id),
  name text NOT NULL,
  type etidealcrm.supplier_type NOT NULL,
  vat_number text,
  contacts jsonb,
  payment_terms text,
  reliability smallint CHECK (reliability BETWEEN 1 AND 5),
  notes text,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE etidealcrm.yard_zone (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealership_id uuid NOT NULL REFERENCES etidealcrm.dealership (id),
  code text NOT NULL,
  name text NOT NULL,
  geometry jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dealership_id, code)
);

CREATE TABLE etidealcrm.yard_slot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id uuid NOT NULL REFERENCES etidealcrm.yard_zone (id) ON DELETE CASCADE,
  code text NOT NULL,
  lat double precision,
  lng double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (zone_id, code)
);

CREATE TABLE etidealcrm.vehicle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealership_id uuid NOT NULL REFERENCES etidealcrm.dealership (id),
  plate text NOT NULL,
  vin text,
  make text,
  model text,
  trim text,
  kind etidealcrm.vehicle_kind NOT NULL,
  body_type etidealcrm.body_type,
  first_registration date,
  mileage_km integer,
  fuel_type text,
  gearbox text,
  power_kw integer,
  color text,
  emission_class text,
  previous_owners smallint,
  supplier_id uuid REFERENCES etidealcrm.supplier (id),
  purchase_cost numeric(12, 2),
  list_price numeric(12, 2),
  sale_price numeric(12, 2),
  entry_date date,
  status etidealcrm.vehicle_status NOT NULL DEFAULT 'incoming',
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  yard_slot_id uuid REFERENCES etidealcrm.yard_slot (id),
  yard_status etidealcrm.yard_status,
  yard_verified_at timestamptz,
  yard_verified_by uuid REFERENCES etidealcrm.profile (id),
  notes text,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dealership_id, plate)
);

CREATE TABLE etidealcrm.vehicle_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES etidealcrm.vehicle (id) ON DELETE CASCADE,
  at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid REFERENCES etidealcrm.profile (id),
  type text NOT NULL,
  from_status etidealcrm.vehicle_status,
  to_status etidealcrm.vehicle_status,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE etidealcrm.vehicle_work (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES etidealcrm.vehicle (id) ON DELETE CASCADE,
  kind etidealcrm.vehicle_work_kind NOT NULL,
  status etidealcrm.vehicle_work_status NOT NULL DEFAULT 'planned',
  cost numeric(12, 2),
  started_at timestamptz,
  ended_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE etidealcrm.vehicle_condition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES etidealcrm.vehicle (id) ON DELETE CASCADE,
  phase etidealcrm.condition_phase NOT NULL,
  taken_by uuid REFERENCES etidealcrm.profile (id),
  taken_at timestamptz NOT NULL DEFAULT now(),
  fuel_level etidealcrm.fuel_level,
  mileage_km integer,
  keys_count smallint,
  documents jsonb,
  warning_lights text[],
  tires jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE etidealcrm.vehicle_damage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  condition_id uuid NOT NULL REFERENCES etidealcrm.vehicle_condition (id) ON DELETE CASCADE,
  zone text NOT NULL,
  damage_type etidealcrm.damage_type NOT NULL,
  severity etidealcrm.severity NOT NULL,
  notes text,
  repaired boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE etidealcrm.vehicle_photo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES etidealcrm.vehicle (id) ON DELETE CASCADE,
  condition_id uuid REFERENCES etidealcrm.vehicle_condition (id) ON DELETE SET NULL,
  storage_path text NOT NULL,
  kind text,
  zone text,
  taken_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE etidealcrm.listing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES etidealcrm.vehicle (id) ON DELETE CASCADE,
  portal text NOT NULL,
  status etidealcrm.listing_status NOT NULL DEFAULT 'to_publish',
  external_id text,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vehicle_id, portal)
);

CREATE TABLE etidealcrm.customer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealership_id uuid NOT NULL REFERENCES etidealcrm.dealership (id),
  first_name text NOT NULL,
  last_name text NOT NULL,
  phone text,
  email text,
  city text,
  language text NOT NULL DEFAULT 'it',
  privacy_consent boolean NOT NULL DEFAULT false,
  marketing_consent boolean NOT NULL DEFAULT false,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE etidealcrm.lead (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealership_id uuid NOT NULL REFERENCES etidealcrm.dealership (id),
  customer_id uuid NOT NULL REFERENCES etidealcrm.customer (id),
  channel etidealcrm.lead_channel NOT NULL,
  source_ref text,
  vehicle_id uuid REFERENCES etidealcrm.vehicle (id),
  interest_text text,
  price_band char(1) CHECK (price_band IN ('A', 'B', 'C', 'D')),
  purchase_type etidealcrm.purchase_type,
  urgency etidealcrm.urgency,
  status etidealcrm.lead_status NOT NULL DEFAULT 'new',
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  status_deadline_at timestamptz,
  temperature etidealcrm.lead_temperature,
  ai_score smallint CHECK (ai_score BETWEEN 0 AND 100),
  ai_intent text,
  ai_summary text,
  assigned_to uuid REFERENCES etidealcrm.profile (id),
  assigned_at timestamptz,
  assignment_reason jsonb,
  reassignment_count smallint NOT NULL DEFAULT 0,
  first_contact_at timestamptz,
  response_minutes integer,
  last_contact_at timestamptz,
  next_action text,
  next_action_at timestamptz,
  lost_reason etidealcrm.lost_reason,
  deal_id uuid,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE etidealcrm.lead_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES etidealcrm.lead (id) ON DELETE CASCADE,
  at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid REFERENCES etidealcrm.profile (id),
  actor_kind etidealcrm.actor_kind NOT NULL DEFAULT 'system',
  type text NOT NULL,
  from_status etidealcrm.lead_status,
  to_status etidealcrm.lead_status,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE etidealcrm.conversation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES etidealcrm.lead (id) ON DELETE CASCADE,
  channel etidealcrm.lead_channel NOT NULL,
  direction etidealcrm.message_direction NOT NULL,
  body text,
  transcript text,
  audio_path text,
  is_ai boolean NOT NULL DEFAULT false,
  at timestamptz NOT NULL DEFAULT now(),
  external_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE etidealcrm.appointment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES etidealcrm.lead (id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES etidealcrm.vehicle (id),
  salesperson_id uuid REFERENCES etidealcrm.profile (id),
  starts_at timestamptz NOT NULL,
  status etidealcrm.appointment_status NOT NULL DEFAULT 'scheduled',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE etidealcrm.deal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealership_id uuid NOT NULL REFERENCES etidealcrm.dealership (id),
  lead_id uuid REFERENCES etidealcrm.lead (id),
  customer_id uuid NOT NULL REFERENCES etidealcrm.customer (id),
  vehicle_id uuid NOT NULL REFERENCES etidealcrm.vehicle (id),
  salesperson_id uuid REFERENCES etidealcrm.profile (id),
  status etidealcrm.deal_status NOT NULL DEFAULT 'open',
  sale_price numeric(12, 2),
  deposit numeric(12, 2),
  trade_in jsonb,
  financing jsonb,
  warranty_months smallint,
  conclusion_type etidealcrm.conclusion_type,
  signed_at timestamptz,
  delivered_at timestamptz,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE etidealcrm.lead
  ADD CONSTRAINT lead_deal_id_fkey
  FOREIGN KEY (deal_id) REFERENCES etidealcrm.deal (id);

CREATE TABLE etidealcrm.deal_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES etidealcrm.deal (id) ON DELETE CASCADE,
  type etidealcrm.deal_item_type NOT NULL,
  kind etidealcrm.deal_item_kind NOT NULL,
  estimated numeric(12, 2),
  actual numeric(12, 2),
  status etidealcrm.deal_item_status NOT NULL DEFAULT 'planned',
  source text,
  date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE etidealcrm.contract (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES etidealcrm.deal (id) ON DELETE CASCADE,
  template_version text,
  data jsonb,
  pdf_path text,
  generated_at timestamptz,
  signed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE etidealcrm.import_job (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealership_id uuid NOT NULL REFERENCES etidealcrm.dealership (id),
  kind etidealcrm.import_kind NOT NULL,
  file_path text,
  status etidealcrm.import_job_status NOT NULL DEFAULT 'pending',
  mapping jsonb,
  total integer,
  valid integer,
  skipped integer,
  duplicates integer,
  created_by uuid REFERENCES etidealcrm.profile (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE etidealcrm.import_row (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES etidealcrm.import_job (id) ON DELETE CASCADE,
  row_no integer NOT NULL,
  raw jsonb NOT NULL,
  status etidealcrm.import_row_status NOT NULL DEFAULT 'pending',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE etidealcrm.outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealership_id uuid REFERENCES etidealcrm.dealership (id),
  integration text NOT NULL,
  action text NOT NULL,
  payload jsonb NOT NULL,
  status etidealcrm.outbox_status NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE etidealcrm.notification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES etidealcrm.profile (id) ON DELETE CASCADE,
  type text NOT NULL,
  payload jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE etidealcrm.message_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealership_id uuid NOT NULL REFERENCES etidealcrm.dealership (id),
  key text NOT NULL,
  channel etidealcrm.lead_channel NOT NULL,
  body text NOT NULL,
  variables jsonb,
  approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dealership_id, key, channel)
);

-- ---------------------------------------------------------------------------
-- Indexes (FKs + RLS filters)
-- ---------------------------------------------------------------------------

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
CREATE UNIQUE INDEX customer_dealership_email_uidx
  ON etidealcrm.customer (dealership_id, lower(email))
  WHERE email IS NOT NULL AND btrim(email) <> '';
CREATE UNIQUE INDEX customer_dealership_phone_uidx
  ON etidealcrm.customer (dealership_id, phone)
  WHERE phone IS NOT NULL AND btrim(phone) <> '';
CREATE INDEX lead_dealership_id_idx ON etidealcrm.lead (dealership_id);
CREATE INDEX lead_customer_id_idx ON etidealcrm.lead (customer_id);
CREATE INDEX lead_vehicle_id_idx ON etidealcrm.lead (vehicle_id);
CREATE INDEX lead_assigned_to_idx ON etidealcrm.lead (assigned_to);
CREATE INDEX lead_status_idx ON etidealcrm.lead (dealership_id, status);
CREATE INDEX lead_deadline_idx ON etidealcrm.lead (status_deadline_at)
  WHERE status_deadline_at IS NOT NULL;
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

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION etidealcrm.normalize_vehicle_plate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = etidealcrm
AS $$
BEGIN
  NEW.plate := upper(regexp_replace(coalesce(NEW.plate, ''), '\s+', '', 'g'));
  IF NEW.plate !~ '^[A-Z]{2}[0-9]{3}[A-Z]{2}$' THEN
    RAISE EXCEPTION 'invalid plate % (expected Italian format AA999AA)', NEW.plate;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER vehicle_normalize_plate
  BEFORE INSERT OR UPDATE OF plate ON etidealcrm.vehicle
  FOR EACH ROW
  EXECUTE FUNCTION etidealcrm.normalize_vehicle_plate();

CREATE OR REPLACE FUNCTION etidealcrm.enforce_max_authorized_devices()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = etidealcrm
AS $$
BEGIN
  IF NEW.status = 'authorized' THEN
    IF (
      SELECT count(*) FROM etidealcrm.device d
      WHERE d.user_id = NEW.user_id
        AND d.status = 'authorized'
        AND d.id IS DISTINCT FROM NEW.id
    ) >= 2 THEN
      RAISE EXCEPTION 'maximum of 2 authorized devices per user';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER device_max_authorized
  BEFORE INSERT OR UPDATE OF status ON etidealcrm.device
  FOR EACH ROW
  EXECUTE FUNCTION etidealcrm.enforce_max_authorized_devices();

CREATE OR REPLACE FUNCTION etidealcrm.record_setting_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = etidealcrm
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.value IS DISTINCT FROM OLD.value THEN
    INSERT INTO etidealcrm.setting_history (setting_id, old_value, new_value, changed_by)
    VALUES (NEW.id, OLD.value, NEW.value, NEW.updated_by);
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER setting_write_history
  BEFORE UPDATE ON etidealcrm.setting
  FOR EACH ROW
  EXECUTE FUNCTION etidealcrm.record_setting_history();

-- ---------------------------------------------------------------------------
-- RLS helpers (SECURITY DEFINER; execute granted to authenticated only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION etidealcrm.is_active_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = etidealcrm
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM etidealcrm.profile p
    WHERE p.id = (SELECT auth.uid())
      AND p.is_active
  );
$$;

CREATE OR REPLACE FUNCTION etidealcrm.app_current_role()
RETURNS etidealcrm.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = etidealcrm
AS $$
  SELECT p.role
  FROM etidealcrm.profile p
  WHERE p.id = (SELECT auth.uid())
    AND p.is_active;
$$;

CREATE OR REPLACE FUNCTION etidealcrm.current_dealership_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = etidealcrm
AS $$
  SELECT p.dealership_id
  FROM etidealcrm.profile p
  WHERE p.id = (SELECT auth.uid())
    AND p.is_active;
$$;

CREATE OR REPLACE FUNCTION etidealcrm.has_role(VARIADIC roles etidealcrm.app_role[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = etidealcrm
AS $$
  SELECT etidealcrm.app_current_role() = ANY (roles);
$$;

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
  BEGIN
    hdr := current_setting('request.headers', true)::json;
  EXCEPTION WHEN OTHERS THEN
    RETURN true;
  END;
  IF hdr IS NULL THEN
    RETURN true;
  END IF;
  install := hdr ->> 'x-device-id';
  IF install IS NULL OR btrim(install) = '' THEN
    RETURN true;
  END IF;
  RETURN EXISTS (
    SELECT 1
    FROM etidealcrm.device d
    WHERE d.user_id = (SELECT auth.uid())
      AND d.install_id = install
      AND d.status = 'authorized'
  );
END;
$$;

CREATE OR REPLACE FUNCTION etidealcrm.can_read_leads()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = etidealcrm AS $$
  SELECT etidealcrm.has_role(
    'admin','owner','sales_manager','salesperson','used_manager',
    'accounting','finance_insurance','marketing'
  );
$$;

CREATE OR REPLACE FUNCTION etidealcrm.can_write_all_leads()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = etidealcrm AS $$
  SELECT etidealcrm.has_role('admin','sales_manager');
$$;

CREATE OR REPLACE FUNCTION etidealcrm.can_read_vehicles()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = etidealcrm AS $$
  SELECT etidealcrm.has_role(
    'admin','owner','sales_manager','salesperson','used_manager',
    'reconditioning','yard','accounting','finance_insurance','marketing'
  );
$$;

CREATE OR REPLACE FUNCTION etidealcrm.can_write_vehicles()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = etidealcrm AS $$
  SELECT etidealcrm.has_role('admin','used_manager');
$$;

CREATE OR REPLACE FUNCTION etidealcrm.can_read_costs()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = etidealcrm AS $$
  SELECT etidealcrm.has_role(
    'admin','owner','sales_manager','used_manager','accounting','finance_insurance'
  );
$$;

CREATE OR REPLACE FUNCTION etidealcrm.can_write_conditions()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = etidealcrm AS $$
  SELECT etidealcrm.has_role('admin','used_manager','reconditioning','yard');
$$;

CREATE OR REPLACE FUNCTION etidealcrm.can_write_work()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = etidealcrm AS $$
  SELECT etidealcrm.has_role('admin','used_manager','reconditioning');
$$;

CREATE OR REPLACE FUNCTION etidealcrm.can_write_listings()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = etidealcrm AS $$
  SELECT etidealcrm.has_role('admin','used_manager','marketing');
$$;

CREATE OR REPLACE FUNCTION etidealcrm.can_read_deals()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = etidealcrm AS $$
  SELECT etidealcrm.has_role(
    'admin','owner','sales_manager','salesperson','used_manager',
    'accounting','finance_insurance'
  );
$$;

CREATE OR REPLACE FUNCTION etidealcrm.can_write_all_deals()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = etidealcrm AS $$
  SELECT etidealcrm.has_role('admin','sales_manager','accounting','finance_insurance');
$$;

CREATE OR REPLACE FUNCTION etidealcrm.can_write_suppliers()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = etidealcrm AS $$
  SELECT etidealcrm.has_role('admin','used_manager');
$$;

CREATE OR REPLACE FUNCTION etidealcrm.can_read_suppliers()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = etidealcrm AS $$
  SELECT etidealcrm.has_role(
    'admin','owner','sales_manager','used_manager','accounting'
  );
$$;

CREATE OR REPLACE FUNCTION etidealcrm.can_write_yard()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = etidealcrm AS $$
  SELECT etidealcrm.has_role('admin','yard');
$$;

CREATE OR REPLACE FUNCTION etidealcrm.can_read_yard()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = etidealcrm AS $$
  SELECT etidealcrm.has_role(
    'admin','owner','sales_manager','salesperson','used_manager','reconditioning','yard'
  );
$$;

CREATE OR REPLACE FUNCTION etidealcrm.can_manage_users()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = etidealcrm AS $$
  SELECT etidealcrm.has_role('admin');
$$;

CREATE OR REPLACE FUNCTION etidealcrm.vehicle_in_current_dealership(_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = etidealcrm
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM etidealcrm.vehicle v
    WHERE v.id = _id
      AND v.dealership_id = etidealcrm.current_dealership_id()
  );
$$;

CREATE OR REPLACE FUNCTION etidealcrm.set_vehicle_yard_position(
  _vehicle_id uuid,
  _slot_id uuid,
  _yard_status etidealcrm.yard_status
) RETURNS etidealcrm.vehicle
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = etidealcrm
AS $$
DECLARE
  rec etidealcrm.vehicle;
BEGIN
  IF NOT (etidealcrm.can_write_yard() OR etidealcrm.can_write_vehicles()) THEN
    RAISE EXCEPTION 'not allowed to update yard position';
  END IF;
  IF NOT etidealcrm.vehicle_in_current_dealership(_vehicle_id) THEN
    RAISE EXCEPTION 'vehicle not found';
  END IF;

  UPDATE etidealcrm.vehicle
  SET
    yard_slot_id = _slot_id,
    yard_status = _yard_status,
    yard_verified_at = now(),
    yard_verified_by = auth.uid()
  WHERE id = _vehicle_id
  RETURNING * INTO rec;

  INSERT INTO etidealcrm.vehicle_event (vehicle_id, actor_id, type, payload)
  VALUES (
    _vehicle_id,
    auth.uid(),
    'yard_position',
    jsonb_build_object('slot_id', _slot_id, 'yard_status', _yard_status)
  );

  RETURN rec;
END;
$$;

CREATE OR REPLACE FUNCTION etidealcrm.can_write_setting_key(_key text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = etidealcrm AS $$
  SELECT
    CASE
      WHEN etidealcrm.has_role('admin') THEN true
      WHEN etidealcrm.has_role('owner') THEN _key IN (
        'assignment_weights', 'assignment_params', 'value_bands',
        'ai_switches', 'ai_handoff'
      )
      WHEN etidealcrm.has_role('sales_manager') THEN _key IN (
        'lead_timers', 'assignment_weights', 'assignment_params',
        'value_bands', 'ai_switches', 'ai_handoff'
      )
      ELSE false
    END;
$$;

REVOKE ALL ON FUNCTION etidealcrm.is_active_user() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION etidealcrm.app_current_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION etidealcrm.current_dealership_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION etidealcrm.has_role(etidealcrm.app_role[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION etidealcrm.is_device_authorized() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION etidealcrm.is_active_user() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION etidealcrm.app_current_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION etidealcrm.current_dealership_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION etidealcrm.has_role(etidealcrm.app_role[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION etidealcrm.is_device_authorized() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Domain functions (status changes)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION etidealcrm.lead_timer_minutes(
  _status etidealcrm.lead_status,
  _channel etidealcrm.lead_channel
) RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = etidealcrm
AS $$
DECLARE
  timers jsonb;
BEGIN
  SELECT s.value -> 'timers_min' INTO timers
  FROM etidealcrm.setting s
  WHERE s.dealership_id = etidealcrm.current_dealership_id()
    AND s.key = 'lead_timers';
  IF timers IS NULL THEN
    timers := '{
      "new": 2, "qualified": 5, "assigned": 15, "contacted": 2880,
      "visited": 1440, "proposal_sent": 4320, "negotiating": 10080
    }'::jsonb;
  END IF;
  IF _status = 'ai_qualifying' THEN
    IF _channel = 'voicemail' THEN
      RETURN 10;
    END IF;
    RETURN 1440;
  END IF;
  IF timers ? _status::text THEN
    RETURN (timers ->> _status::text)::integer;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION etidealcrm.change_lead_status(
  _lead_id uuid,
  _to_status etidealcrm.lead_status,
  _payload jsonb DEFAULT '{}'::jsonb
) RETURNS etidealcrm.lead
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = etidealcrm
AS $$
DECLARE
  rec etidealcrm.lead;
  prev etidealcrm.lead_status;
  allowed etidealcrm.lead_status[];
  mins integer;
BEGIN
  SELECT * INTO rec FROM etidealcrm.lead WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead not found';
  END IF;
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
    ELSE ARRAY[]::etidealcrm.lead_status[]
  END;

  IF NOT (_to_status = ANY (allowed)) THEN
    RAISE EXCEPTION 'invalid lead transition % -> %', prev, _to_status;
  END IF;

  IF _to_status = 'lost'
     AND coalesce(_payload ->> 'lost_reason', rec.lost_reason::text) IS NULL THEN
    RAISE EXCEPTION 'lost_reason required';
  END IF;

  mins := etidealcrm.lead_timer_minutes(_to_status, rec.channel);

  UPDATE etidealcrm.lead
  SET
    status = _to_status,
    status_changed_at = now(),
    status_deadline_at = CASE WHEN mins IS NULL THEN NULL ELSE now() + make_interval(mins => mins) END,
    lost_reason = CASE
      WHEN _to_status = 'lost'
        THEN coalesce((_payload ->> 'lost_reason')::etidealcrm.lost_reason, lost_reason)
      ELSE lost_reason
    END
  WHERE id = _lead_id
  RETURNING * INTO rec;

  INSERT INTO etidealcrm.lead_event (
    lead_id, actor_id, actor_kind, type, from_status, to_status, payload
  ) VALUES (
    _lead_id,
    auth.uid(),
    CASE WHEN auth.uid() IS NULL THEN 'system' ELSE 'user' END,
    'status_change',
    prev,
    _to_status,
    coalesce(_payload, '{}'::jsonb)
  );

  RETURN rec;
END;
$$;

CREATE OR REPLACE FUNCTION etidealcrm.change_vehicle_status(
  _vehicle_id uuid,
  _to_status etidealcrm.vehicle_status,
  _payload jsonb DEFAULT '{}'::jsonb
) RETURNS etidealcrm.vehicle
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = etidealcrm
AS $$
DECLARE
  rec etidealcrm.vehicle;
  prev etidealcrm.vehicle_status;
BEGIN
  SELECT * INTO rec FROM etidealcrm.vehicle WHERE id = _vehicle_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'vehicle not found';
  END IF;
  prev := rec.status;

  UPDATE etidealcrm.vehicle
  SET status = _to_status, status_changed_at = now()
  WHERE id = _vehicle_id
  RETURNING * INTO rec;

  INSERT INTO etidealcrm.vehicle_event (
    vehicle_id, actor_id, type, from_status, to_status, payload
  ) VALUES (
    _vehicle_id, auth.uid(), 'status_change', prev, _to_status, coalesce(_payload, '{}'::jsonb)
  );

  RETURN rec;
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
  chosen uuid;
BEGIN
  SELECT * INTO rec FROM etidealcrm.lead WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead not found';
  END IF;

  SELECT p.id INTO chosen
  FROM etidealcrm.profile p
  WHERE p.dealership_id = rec.dealership_id
    AND p.role = 'salesperson'
    AND p.is_active
    AND p.is_available
  ORDER BY (
    SELECT count(*) FROM etidealcrm.lead l
    WHERE l.assigned_to = p.id
      AND l.status NOT IN ('won', 'lost', 'invalid')
  ) ASC, p.full_name
  LIMIT 1;

  IF chosen IS NULL THEN
    SELECT p.id INTO chosen
    FROM etidealcrm.profile p
    WHERE p.dealership_id = rec.dealership_id
      AND p.role = 'sales_manager'
      AND p.is_active
    LIMIT 1;
  END IF;

  UPDATE etidealcrm.lead
  SET
    assigned_to = chosen,
    assigned_at = now(),
    assignment_reason = jsonb_build_object(
      'strategy', 'stub_least_open_leads',
      'chosen', chosen
    )
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
BEGIN
  SELECT * INTO rec FROM etidealcrm.deal WHERE id = _deal_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'deal not found';
  END IF;

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

  INSERT INTO etidealcrm.notification (user_id, type, payload)
  SELECT p.id, 'deal_signed', jsonb_build_object('deal_id', _deal_id)
  FROM etidealcrm.profile p
  WHERE p.dealership_id = rec.dealership_id
    AND p.role IN ('accounting', 'finance_insurance', 'admin')
    AND p.is_active;

  RETURN rec;
END;
$$;

GRANT EXECUTE ON FUNCTION etidealcrm.change_lead_status(uuid, etidealcrm.lead_status, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION etidealcrm.change_vehicle_status(uuid, etidealcrm.vehicle_status, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION etidealcrm.assign_lead(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION etidealcrm.on_deal_signed(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION etidealcrm.set_vehicle_yard_position(uuid, uuid, etidealcrm.yard_status) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION etidealcrm.vehicle_in_current_dealership(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------

CREATE VIEW etidealcrm.vehicle_stock
WITH (security_invoker = true) AS
SELECT
  v.id,
  v.dealership_id,
  v.plate,
  v.vin,
  v.make,
  v.model,
  v.trim,
  v.kind,
  v.status,
  v.list_price,
  v.sale_price,
  v.purchase_cost,
  v.entry_date,
  v.is_demo,
  GREATEST(0, (CURRENT_DATE - coalesce(v.entry_date, v.created_at::date)))::integer AS days_in_stock,
  coalesce((
    SELECT sum(w.cost) FROM etidealcrm.vehicle_work w WHERE w.vehicle_id = v.id
  ), 0)::numeric(12, 2) AS reconditioning_cost
FROM etidealcrm.vehicle v;

CREATE VIEW etidealcrm.vehicle_public
WITH (security_barrier = true) AS
SELECT
  v.id,
  v.dealership_id,
  v.plate,
  v.vin,
  v.make,
  v.model,
  v.trim,
  v.kind,
  v.body_type,
  v.first_registration,
  v.mileage_km,
  v.fuel_type,
  v.gearbox,
  v.power_kw,
  v.color,
  v.emission_class,
  v.previous_owners,
  v.supplier_id,
  v.list_price,
  v.sale_price,
  v.entry_date,
  v.status,
  v.status_changed_at,
  v.yard_slot_id,
  v.yard_status,
  v.yard_verified_at,
  v.notes,
  v.is_demo,
  v.created_at,
  GREATEST(0, (CURRENT_DATE - coalesce(v.entry_date, v.created_at::date)))::integer AS days_in_stock
FROM etidealcrm.vehicle v
WHERE v.dealership_id = etidealcrm.current_dealership_id()
  AND etidealcrm.is_active_user()
  AND etidealcrm.can_read_vehicles();

CREATE VIEW etidealcrm.deal_margin
WITH (security_invoker = true) AS
SELECT
  d.id AS deal_id,
  d.dealership_id,
  d.vehicle_id,
  d.status,
  d.sale_price,
  coalesce(sum(CASE WHEN i.kind = 'revenue' THEN coalesce(i.estimated, 0) ELSE 0 END), 0) AS estimated_revenue,
  coalesce(sum(CASE WHEN i.kind = 'cost' THEN coalesce(i.estimated, 0) ELSE 0 END), 0) AS estimated_cost,
  coalesce(sum(CASE WHEN i.kind = 'revenue' THEN coalesce(i.actual, i.estimated, 0) ELSE 0 END), 0) AS actual_revenue,
  coalesce(sum(CASE WHEN i.kind = 'cost' THEN coalesce(i.actual, i.estimated, 0) ELSE 0 END), 0) AS actual_cost,
  coalesce(sum(CASE WHEN i.kind = 'revenue' THEN coalesce(i.estimated, 0) ELSE 0 END), 0)
    - coalesce(sum(CASE WHEN i.kind = 'cost' THEN coalesce(i.estimated, 0) ELSE 0 END), 0) AS estimated_margin,
  coalesce(sum(CASE WHEN i.kind = 'revenue' THEN coalesce(i.actual, i.estimated, 0) ELSE 0 END), 0)
    - coalesce(sum(CASE WHEN i.kind = 'cost' THEN coalesce(i.actual, i.estimated, 0) ELSE 0 END), 0) AS actual_margin
FROM etidealcrm.deal d
LEFT JOIN etidealcrm.deal_item i ON i.deal_id = d.id
GROUP BY d.id;

CREATE VIEW etidealcrm.lead_open
WITH (security_invoker = true) AS
SELECT
  l.*,
  CASE
    WHEN l.status_deadline_at IS NULL THEN NULL
    ELSE extract(epoch FROM (l.status_deadline_at - now()))::integer
  END AS remaining_seconds
FROM etidealcrm.lead l
WHERE l.status NOT IN ('won', 'lost', 'invalid');
