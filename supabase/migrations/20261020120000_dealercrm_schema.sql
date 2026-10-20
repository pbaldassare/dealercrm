-- Dealer CRM: schema completo in un solo file (sostituisce le vecchie migrazioni etidealcrm).
-- Tutto vive nello schema dealercrm. Il progetto Supabase ospita altri schemi (public, etideal, tf_*): non toccarli.
--
-- Regole di sicurezza applicate qui:
--  * nessun accesso per anon: tabelle e funzioni sono revocate a PUBLIC e anon;
--  * ruolo e concessionario si leggono solo con utente attivo e dispositivo approvato (device_ok);
--  * gli stati di lead, veicoli e pratiche cambiano solo dalle funzioni (trigger guard_status);
--  * le funzioni pubbliche controllano il ruolo; quelle con prefisso _ sono interne (solo service_role).

CREATE SCHEMA IF NOT EXISTS dealercrm;
REVOKE ALL ON SCHEMA dealercrm FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA dealercrm TO authenticated, service_role;

-- ===================================================================== enum
CREATE TYPE dealercrm.app_role AS ENUM ('admin','owner','sales_manager','salesperson','used_manager','reconditioning','yard','accounting','finance_insurance','marketing');
CREATE TYPE dealercrm.lead_channel AS ENUM ('autoscout24','other_portal','website','whatsapp','voicemail','phone','facebook','instagram','walk_in');
CREATE TYPE dealercrm.lead_status AS ENUM ('new','ai_qualifying','qualified','assigned','contacted','appointment_set','visited','proposal_sent','negotiating','won','lost','invalid');
CREATE TYPE dealercrm.lead_temperature AS ENUM ('hot','warm','cold','invalid');
CREATE TYPE dealercrm.lost_reason AS ENUM ('price_too_high','vehicle_sold','chose_competitor','no_response','financing_denied','trade_in_not_accepted','changed_mind','other');
CREATE TYPE dealercrm.purchase_type AS ENUM ('cash','financing','trade_in');
CREATE TYPE dealercrm.urgency AS ENUM ('low','medium','high');
CREATE TYPE dealercrm.actor_kind AS ENUM ('user','system','ai');
CREATE TYPE dealercrm.message_direction AS ENUM ('in','out');
CREATE TYPE dealercrm.vehicle_status AS ENUM ('incoming','received','reconditioning','ready','published','reserved','sold','delivering','delivered','withdrawn');
CREATE TYPE dealercrm.yard_status AS ENUM ('in_yard','workshop','test_drive','off_site');
CREATE TYPE dealercrm.vehicle_kind AS ENUM ('new','km0','used');
CREATE TYPE dealercrm.body_type AS ENUM ('city_car','sedan','station_wagon','suv','minivan','coupe','other');
CREATE TYPE dealercrm.vehicle_work_kind AS ENUM ('bodywork','mechanical','cleaning','documents');
CREATE TYPE dealercrm.vehicle_work_status AS ENUM ('planned','in_progress','done');
CREATE TYPE dealercrm.condition_phase AS ENUM ('intake','during','delivery');
CREATE TYPE dealercrm.fuel_level AS ENUM ('empty','quarter','half','three_quarters','full');
CREATE TYPE dealercrm.damage_type AS ENUM ('scratch','dent','break','wear');
CREATE TYPE dealercrm.severity AS ENUM ('light','medium','severe');
CREATE TYPE dealercrm.listing_status AS ENUM ('to_publish','publishing','published','error','withdrawn','suspended');
CREATE TYPE dealercrm.supplier_type AS ENUM ('private','customer_trade_in','auction','dealer','import','rental_company');
CREATE TYPE dealercrm.deal_status AS ENUM ('open','quote_sent','contract_pending','signed','payment_pending','transfer_documents','delivered','closed','cancelled');
CREATE TYPE dealercrm.deal_item_type AS ENUM ('vehicle_margin','financing_interest','insurance','cvt','gps','etching','extended_warranty','fees','discount','salesperson_commission','other_cost');
CREATE TYPE dealercrm.deal_item_kind AS ENUM ('revenue','cost');
CREATE TYPE dealercrm.deal_item_status AS ENUM ('planned','confirmed','collected');
CREATE TYPE dealercrm.conclusion_type AS ENUM ('on_premises','distance','off_premises');
CREATE TYPE dealercrm.device_status AS ENUM ('pending','authorized','revoked');
CREATE TYPE dealercrm.appointment_status AS ENUM ('scheduled','confirmed','done','no_show','cancelled');
CREATE TYPE dealercrm.outbox_status AS ENUM ('pending','sent','failed');
CREATE TYPE dealercrm.import_kind AS ENUM ('vehicles','leads','customers','suppliers');
CREATE TYPE dealercrm.import_job_status AS ENUM ('pending','preview','importing','done','failed');
CREATE TYPE dealercrm.import_row_status AS ENUM ('pending','valid','skipped','duplicate','error');
CREATE TYPE dealercrm.invoice_kind AS ENUM ('invoice','proforma','credit_note','receipt');
CREATE TYPE dealercrm.invoice_status AS ENUM ('draft','queued','created','sent','paid','error','cancelled');

-- ===================================================================== tabelle
CREATE TABLE dealercrm.dealership (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  vat_number text,
  address text,
  timezone text NOT NULL DEFAULT 'Europe/Rome',
  lat double precision,
  lng double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE dealercrm.profile (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  dealership_id uuid NOT NULL REFERENCES dealercrm.dealership (id),
  full_name text NOT NULL,
  role dealercrm.app_role NOT NULL,
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  is_available boolean NOT NULL DEFAULT true,
  enabled_bands text[] NOT NULL DEFAULT ARRAY['A','B'],
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE dealercrm.device (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES dealercrm.profile (id) ON DELETE CASCADE,
  install_id text NOT NULL UNIQUE,
  name text,
  status dealercrm.device_status NOT NULL DEFAULT 'pending',
  requested_at timestamptz NOT NULL DEFAULT now(),
  authorized_by uuid REFERENCES dealercrm.profile (id),
  authorized_at timestamptz,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE dealercrm.setting (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealership_id uuid NOT NULL REFERENCES dealercrm.dealership (id),
  key text NOT NULL,
  value jsonb NOT NULL,
  updated_by uuid REFERENCES dealercrm.profile (id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dealership_id, key)
);
CREATE TABLE dealercrm.setting_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_id uuid NOT NULL REFERENCES dealercrm.setting (id) ON DELETE CASCADE,
  old_value jsonb,
  new_value jsonb NOT NULL,
  changed_by uuid REFERENCES dealercrm.profile (id),
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE dealercrm.supplier (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealership_id uuid NOT NULL REFERENCES dealercrm.dealership (id),
  name text NOT NULL,
  type dealercrm.supplier_type NOT NULL,
  vat_number text,
  contacts jsonb,
  payment_terms text,
  reliability smallint CHECK (reliability BETWEEN 1 AND 5),
  notes text,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE dealercrm.yard_zone (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealership_id uuid NOT NULL REFERENCES dealercrm.dealership (id),
  code text NOT NULL,
  name text NOT NULL,
  geometry jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dealership_id, code)
);
CREATE TABLE dealercrm.yard_slot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id uuid NOT NULL REFERENCES dealercrm.yard_zone (id) ON DELETE CASCADE,
  code text NOT NULL,
  lat double precision,
  lng double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (zone_id, code)
);
CREATE TABLE dealercrm.vehicle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealership_id uuid NOT NULL REFERENCES dealercrm.dealership (id),
  plate text NOT NULL,
  vin text,
  make text,
  model text,
  trim text,
  kind dealercrm.vehicle_kind NOT NULL DEFAULT 'used',
  body_type dealercrm.body_type,
  first_registration date,
  mileage_km integer,
  fuel_type text,
  gearbox text,
  power_kw integer,
  color text,
  emission_class text,
  previous_owners smallint,
  supplier_id uuid REFERENCES dealercrm.supplier (id),
  purchase_cost numeric(12,2),
  list_price numeric(12,2),
  sale_price numeric(12,2),
  entry_date date,
  status dealercrm.vehicle_status NOT NULL DEFAULT 'incoming',
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  yard_slot_id uuid REFERENCES dealercrm.yard_slot (id),
  yard_status dealercrm.yard_status,
  yard_verified_at timestamptz,
  yard_verified_by uuid REFERENCES dealercrm.profile (id),
  notes text,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dealership_id, plate)
);
CREATE TABLE dealercrm.vehicle_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES dealercrm.vehicle (id) ON DELETE CASCADE,
  at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid REFERENCES dealercrm.profile (id),
  type text NOT NULL,
  from_status dealercrm.vehicle_status,
  to_status dealercrm.vehicle_status,
  payload jsonb
);
CREATE TABLE dealercrm.vehicle_work (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES dealercrm.vehicle (id) ON DELETE CASCADE,
  kind dealercrm.vehicle_work_kind NOT NULL,
  status dealercrm.vehicle_work_status NOT NULL DEFAULT 'planned',
  cost numeric(12,2),
  started_at timestamptz,
  ended_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE dealercrm.vehicle_condition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES dealercrm.vehicle (id) ON DELETE CASCADE,
  phase dealercrm.condition_phase NOT NULL,
  taken_by uuid REFERENCES dealercrm.profile (id),
  taken_at timestamptz NOT NULL DEFAULT now(),
  fuel_level dealercrm.fuel_level,
  mileage_km integer,
  keys_count smallint,
  documents jsonb,
  warning_lights text[],
  tires jsonb,
  notes text
);
CREATE TABLE dealercrm.vehicle_damage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  condition_id uuid NOT NULL REFERENCES dealercrm.vehicle_condition (id) ON DELETE CASCADE,
  zone text NOT NULL,
  damage_type dealercrm.damage_type NOT NULL,
  severity dealercrm.severity NOT NULL,
  notes text,
  repaired boolean NOT NULL DEFAULT false
);
CREATE TABLE dealercrm.vehicle_photo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES dealercrm.vehicle (id) ON DELETE CASCADE,
  condition_id uuid REFERENCES dealercrm.vehicle_condition (id) ON DELETE SET NULL,
  storage_path text NOT NULL,
  kind text,
  zone text,
  taken_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE dealercrm.listing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES dealercrm.vehicle (id) ON DELETE CASCADE,
  portal text NOT NULL,
  status dealercrm.listing_status NOT NULL DEFAULT 'to_publish',
  external_id text,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vehicle_id, portal)
);
CREATE TABLE dealercrm.customer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealership_id uuid NOT NULL REFERENCES dealercrm.dealership (id),
  first_name text NOT NULL DEFAULT '',
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
CREATE TABLE dealercrm.lead (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealership_id uuid NOT NULL REFERENCES dealercrm.dealership (id),
  customer_id uuid NOT NULL REFERENCES dealercrm.customer (id),
  channel dealercrm.lead_channel NOT NULL,
  source_ref text,
  vehicle_id uuid REFERENCES dealercrm.vehicle (id),
  interest_text text,
  price_band char(1) CHECK (price_band IN ('A','B','C','D')),
  purchase_type dealercrm.purchase_type,
  urgency dealercrm.urgency,
  status dealercrm.lead_status NOT NULL DEFAULT 'new',
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  status_deadline_at timestamptz,
  escalation_level smallint NOT NULL DEFAULT 0,  -- lead assegnata: 0 nessun avviso, 1 avvisato il venditore, 2 avvisato il responsabile
  temperature dealercrm.lead_temperature,
  ai_score smallint CHECK (ai_score BETWEEN 0 AND 100),
  ai_intent text,
  ai_summary text,
  assigned_to uuid REFERENCES dealercrm.profile (id),
  assigned_at timestamptz,
  assignment_reason jsonb,
  reassignment_count smallint NOT NULL DEFAULT 0,
  first_contact_at timestamptz,
  response_minutes integer,
  last_contact_at timestamptz,
  next_action text,
  next_action_at timestamptz,
  lost_reason dealercrm.lost_reason,
  deal_id uuid,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE dealercrm.lead_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES dealercrm.lead (id) ON DELETE CASCADE,
  at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid REFERENCES dealercrm.profile (id),
  actor_kind dealercrm.actor_kind NOT NULL DEFAULT 'system',
  type text NOT NULL,
  from_status dealercrm.lead_status,
  to_status dealercrm.lead_status,
  payload jsonb
);
CREATE TABLE dealercrm.conversation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES dealercrm.lead (id) ON DELETE CASCADE,
  channel dealercrm.lead_channel NOT NULL,
  direction dealercrm.message_direction NOT NULL,
  body text,
  transcript text,
  audio_path text,
  is_ai boolean NOT NULL DEFAULT false,
  at timestamptz NOT NULL DEFAULT now(),
  external_id text
);
CREATE TABLE dealercrm.appointment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES dealercrm.lead (id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES dealercrm.vehicle (id),
  salesperson_id uuid REFERENCES dealercrm.profile (id),
  starts_at timestamptz NOT NULL,
  status dealercrm.appointment_status NOT NULL DEFAULT 'scheduled',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE dealercrm.deal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealership_id uuid NOT NULL REFERENCES dealercrm.dealership (id),
  lead_id uuid REFERENCES dealercrm.lead (id),
  customer_id uuid NOT NULL REFERENCES dealercrm.customer (id),
  vehicle_id uuid NOT NULL REFERENCES dealercrm.vehicle (id),
  salesperson_id uuid REFERENCES dealercrm.profile (id),
  status dealercrm.deal_status NOT NULL DEFAULT 'open',
  sale_price numeric(12,2),
  deposit numeric(12,2),
  trade_in jsonb,
  financing jsonb,
  warranty_months smallint,
  conclusion_type dealercrm.conclusion_type,
  signed_at timestamptz,
  delivered_at timestamptz,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE dealercrm.lead ADD CONSTRAINT lead_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES dealercrm.deal (id);
CREATE TABLE dealercrm.deal_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES dealercrm.deal (id) ON DELETE CASCADE,
  type dealercrm.deal_item_type NOT NULL,
  kind dealercrm.deal_item_kind NOT NULL,
  estimated numeric(12,2),
  actual numeric(12,2),
  status dealercrm.deal_item_status NOT NULL DEFAULT 'planned',
  source text,
  date date,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE dealercrm.contract (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES dealercrm.deal (id) ON DELETE CASCADE,
  template_version text,
  data jsonb,           -- copia dei valori usati (e, alla firma, degli importi stimati congelati)
  pdf_path text,        -- percorso nel bucket dealercrm-documents
  generated_at timestamptz,
  signed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE dealercrm.invoice (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealership_id uuid NOT NULL REFERENCES dealercrm.dealership (id),
  deal_id uuid REFERENCES dealercrm.deal (id),
  kind dealercrm.invoice_kind NOT NULL DEFAULT 'invoice',
  status dealercrm.invoice_status NOT NULL DEFAULT 'draft',
  fic_document_id bigint,
  number int,
  numeration text,
  date date,
  amount_net numeric(12,2),
  amount_vat numeric(12,2),
  amount_gross numeric(12,2),
  payload jsonb,
  response jsonb,
  fic_url text,
  pdf_path text,
  dry_run boolean NOT NULL DEFAULT true,
  last_error text,
  requested_by uuid,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dealership_id, fic_document_id)
);
-- Token di Fatture in Cloud: solo service_role (nessuna policy, nessun grant ad authenticated)
CREATE TABLE dealercrm.fic_connection (
  dealership_id uuid PRIMARY KEY REFERENCES dealercrm.dealership (id) ON DELETE CASCADE,
  company_id bigint,
  company_name text,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  scopes text,
  connected_by uuid,
  connected_at timestamptz DEFAULT now(),
  last_error text,
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE dealercrm.fic_webhook_event (
  id text PRIMARY KEY,
  type text NOT NULL,
  subject text,
  occurred_at timestamptz,
  received_at timestamptz DEFAULT now(),
  payload jsonb,
  processed_at timestamptz,
  error text
);
CREATE TABLE dealercrm.import_job (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealership_id uuid NOT NULL REFERENCES dealercrm.dealership (id),
  kind dealercrm.import_kind NOT NULL,
  file_path text,
  status dealercrm.import_job_status NOT NULL DEFAULT 'pending',
  mapping jsonb,
  total integer,
  valid integer,
  skipped integer,
  duplicates integer,
  created_by uuid REFERENCES dealercrm.profile (id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE dealercrm.import_row (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES dealercrm.import_job (id) ON DELETE CASCADE,
  row_no integer NOT NULL,
  raw jsonb NOT NULL,
  status dealercrm.import_row_status NOT NULL DEFAULT 'pending',
  error text
);
-- Azioni verso l'esterno (portali): una riga per azione, idempotente su dedup_key
CREATE TABLE dealercrm.outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealership_id uuid REFERENCES dealercrm.dealership (id),
  integration text NOT NULL,
  action text NOT NULL,
  payload jsonb NOT NULL,
  dedup_key text UNIQUE,
  status dealercrm.outbox_status NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE dealercrm.notification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES dealercrm.profile (id) ON DELETE CASCADE,
  type text NOT NULL,
  payload jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE dealercrm.message_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealership_id uuid NOT NULL REFERENCES dealercrm.dealership (id),
  key text NOT NULL,
  channel dealercrm.lead_channel NOT NULL,
  body text NOT NULL,
  variables jsonb,
  approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dealership_id, key, channel)
);

-- ===================================================================== indici
CREATE INDEX ON dealercrm.profile (dealership_id);
CREATE INDEX ON dealercrm.device (user_id);
CREATE INDEX ON dealercrm.setting_history (setting_id);
CREATE INDEX ON dealercrm.supplier (dealership_id);
CREATE INDEX ON dealercrm.yard_slot (zone_id);
CREATE INDEX ON dealercrm.vehicle (dealership_id, status);
CREATE INDEX ON dealercrm.vehicle (supplier_id);
CREATE INDEX ON dealercrm.vehicle (yard_slot_id);
CREATE INDEX ON dealercrm.vehicle_event (vehicle_id);
CREATE INDEX ON dealercrm.vehicle_work (vehicle_id);
CREATE INDEX ON dealercrm.vehicle_condition (vehicle_id);
CREATE INDEX ON dealercrm.vehicle_damage (condition_id);
CREATE INDEX ON dealercrm.vehicle_photo (vehicle_id);
CREATE INDEX ON dealercrm.customer (dealership_id);
CREATE UNIQUE INDEX customer_email_uidx ON dealercrm.customer (dealership_id, lower(email)) WHERE email IS NOT NULL AND btrim(email) <> '';
CREATE UNIQUE INDEX customer_phone_uidx ON dealercrm.customer (dealership_id, phone) WHERE phone IS NOT NULL AND btrim(phone) <> '';
CREATE INDEX ON dealercrm.lead (dealership_id, status);
CREATE INDEX ON dealercrm.lead (customer_id);
CREATE INDEX ON dealercrm.lead (vehicle_id);
CREATE INDEX ON dealercrm.lead (assigned_to);
CREATE INDEX ON dealercrm.lead (status_deadline_at) WHERE status_deadline_at IS NOT NULL;
CREATE INDEX ON dealercrm.lead_event (lead_id);
CREATE INDEX ON dealercrm.conversation (lead_id);
CREATE INDEX ON dealercrm.appointment (lead_id);
CREATE INDEX ON dealercrm.appointment (salesperson_id);
CREATE INDEX ON dealercrm.deal (dealership_id);
CREATE INDEX ON dealercrm.deal (lead_id);
CREATE INDEX ON dealercrm.deal (vehicle_id);
CREATE INDEX ON dealercrm.deal (salesperson_id);
CREATE INDEX ON dealercrm.deal_item (deal_id);
CREATE INDEX ON dealercrm.contract (deal_id);
CREATE INDEX ON dealercrm.invoice (deal_id);
CREATE INDEX ON dealercrm.import_row (job_id);
CREATE INDEX ON dealercrm.outbox (status, next_attempt_at);
CREATE INDEX ON dealercrm.notification (user_id, read_at);

-- ===================================================================== chi sta chiamando
-- Dispositivo approvato: header x-device-id di un dispositivo authorized dell'utente.
-- L'amministratore passa sempre, altrimenti nessuno potrebbe approvare il primo dispositivo.
CREATE FUNCTION dealercrm.device_ok() RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = dealercrm, pg_temp AS $$
DECLARE install text;
BEGIN
  IF EXISTS (SELECT 1 FROM dealercrm.profile p WHERE p.id = auth.uid() AND p.is_active AND p.role = 'admin') THEN
    RETURN true;
  END IF;
  BEGIN
    install := nullif(btrim(current_setting('request.headers', true)::json ->> 'x-device-id'), '');
  EXCEPTION WHEN OTHERS THEN
    install := NULL;
  END;
  RETURN install IS NOT NULL AND EXISTS (
    SELECT 1 FROM dealercrm.device d
    WHERE d.user_id = auth.uid() AND d.install_id = install AND d.status = 'authorized');
END $$;

-- Ruolo e concessionario: NULL se l'utente è disattivato o il dispositivo non è approvato.
CREATE FUNCTION dealercrm.my_role() RETURNS dealercrm.app_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = dealercrm, pg_temp AS $$
  SELECT p.role FROM dealercrm.profile p WHERE p.id = auth.uid() AND p.is_active AND dealercrm.device_ok();
$$;
CREATE FUNCTION dealercrm.my_dealership() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = dealercrm, pg_temp AS $$
  SELECT p.dealership_id FROM dealercrm.profile p WHERE p.id = auth.uid() AND p.is_active AND dealercrm.device_ok();
$$;
CREATE FUNCTION dealercrm.has_role(VARIADIC roles dealercrm.app_role[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = dealercrm, pg_temp AS $$
  SELECT coalesce(dealercrm.my_role() = ANY (roles), false);
$$;

-- Visibilità delle righe figlie (stesse regole delle tabelle madri)
CREATE FUNCTION dealercrm.vehicle_visible(_vehicle_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = dealercrm, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM dealercrm.vehicle v WHERE v.id = _vehicle_id AND v.dealership_id = dealercrm.my_dealership());
$$;
CREATE FUNCTION dealercrm.lead_visible(_lead_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = dealercrm, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM dealercrm.lead l
    WHERE l.id = _lead_id AND l.dealership_id = dealercrm.my_dealership()
      AND dealercrm.has_role('admin','owner','sales_manager','salesperson','used_manager','accounting','finance_insurance','marketing')
      AND (NOT dealercrm.has_role('salesperson') OR l.assigned_to = auth.uid()));
$$;
CREATE FUNCTION dealercrm.deal_visible(_deal_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = dealercrm, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM dealercrm.deal d
    WHERE d.id = _deal_id AND d.dealership_id = dealercrm.my_dealership()
      AND dealercrm.has_role('admin','owner','sales_manager','salesperson','used_manager','accounting','finance_insurance')
      AND (NOT dealercrm.has_role('salesperson') OR d.salesperson_id = auth.uid()));
$$;
CREATE FUNCTION dealercrm.can_write_setting_key(_key text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = dealercrm, pg_temp AS $$
  SELECT CASE
    WHEN dealercrm.has_role('admin') THEN true
    WHEN dealercrm.has_role('owner') THEN _key IN ('assignment_weights','assignment_params','value_bands','ai_switches','ai_handoff')
    WHEN dealercrm.has_role('sales_manager') THEN _key IN ('lead_timers','assignment_weights','assignment_params','value_bands','ai_switches','ai_handoff')
    ELSE false END;
$$;

-- ===================================================================== trigger
CREATE FUNCTION dealercrm.normalize_vehicle_plate() RETURNS trigger
LANGUAGE plpgsql SET search_path = dealercrm, pg_temp AS $$
BEGIN
  NEW.plate := upper(regexp_replace(coalesce(NEW.plate, ''), '\s+', '', 'g'));
  IF NEW.plate !~ '^[A-Z]{2}[0-9]{3}[A-Z]{2}$' THEN
    RAISE EXCEPTION 'targa non valida % (formato AA999AA)', NEW.plate;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER vehicle_normalize_plate BEFORE INSERT OR UPDATE OF plate ON dealercrm.vehicle
  FOR EACH ROW EXECUTE FUNCTION dealercrm.normalize_vehicle_plate();

CREATE FUNCTION dealercrm.enforce_max_authorized_devices() RETURNS trigger
LANGUAGE plpgsql SET search_path = dealercrm, pg_temp AS $$
BEGIN
  IF NEW.status = 'authorized' AND (
    SELECT count(*) FROM dealercrm.device d
    WHERE d.user_id = NEW.user_id AND d.status = 'authorized' AND d.id IS DISTINCT FROM NEW.id) >= 2 THEN
    RAISE EXCEPTION 'massimo 2 dispositivi autorizzati per utente';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER device_max_authorized BEFORE INSERT OR UPDATE OF status ON dealercrm.device
  FOR EACH ROW EXECUTE FUNCTION dealercrm.enforce_max_authorized_devices();

CREATE FUNCTION dealercrm.record_setting_history() RETURNS trigger
LANGUAGE plpgsql SET search_path = dealercrm, pg_temp AS $$
BEGIN
  IF NEW.value IS DISTINCT FROM OLD.value THEN
    NEW.updated_by := coalesce(auth.uid(), NEW.updated_by);
    NEW.updated_at := now();
    INSERT INTO dealercrm.setting_history (setting_id, old_value, new_value, changed_by)
    VALUES (NEW.id, OLD.value, NEW.value, NEW.updated_by);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER setting_write_history BEFORE UPDATE ON dealercrm.setting
  FOR EACH ROW EXECUTE FUNCTION dealercrm.record_setting_history();

-- Gli stati di lead, veicoli e pratiche cambiano solo dalle funzioni, che accendono dealercrm.status_ok.
-- Una pratica nasce sempre "open".
CREATE FUNCTION dealercrm.guard_status() RETURNS trigger
LANGUAGE plpgsql SET search_path = dealercrm, pg_temp AS $$
BEGIN
  IF current_setting('dealercrm.status_ok', true) = 'on' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF TG_TABLE_NAME = 'deal' AND NEW.status <> 'open' THEN
      RAISE EXCEPTION 'una pratica nuova parte da "open"';
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'lo stato si cambia solo con le funzioni (change_lead_status, change_vehicle_status, set_deal_status)';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER lead_guard_status BEFORE UPDATE OF status ON dealercrm.lead FOR EACH ROW EXECUTE FUNCTION dealercrm.guard_status();
CREATE TRIGGER vehicle_guard_status BEFORE UPDATE OF status ON dealercrm.vehicle FOR EACH ROW EXECUTE FUNCTION dealercrm.guard_status();
CREATE TRIGGER deal_guard_status BEFORE INSERT OR UPDATE OF status ON dealercrm.deal FOR EACH ROW EXECUTE FUNCTION dealercrm.guard_status();

CREATE FUNCTION dealercrm.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = dealercrm, pg_temp AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TRIGGER invoice_updated_at BEFORE UPDATE ON dealercrm.invoice FOR EACH ROW EXECUTE FUNCTION dealercrm.touch_updated_at();

-- ===================================================================== utilità interne
CREATE FUNCTION dealercrm._notify(_user_id uuid, _type text, _payload jsonb) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = dealercrm, pg_temp AS $$
  INSERT INTO dealercrm.notification (user_id, type, payload) SELECT _user_id, _type, _payload WHERE _user_id IS NOT NULL;
$$;
CREATE FUNCTION dealercrm._notify_roles(_dealership_id uuid, _roles dealercrm.app_role[], _type text, _payload jsonb) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = dealercrm, pg_temp AS $$
  INSERT INTO dealercrm.notification (user_id, type, payload)
  SELECT p.id, _type, _payload FROM dealercrm.profile p
  WHERE p.dealership_id = _dealership_id AND p.is_active AND p.role = ANY (_roles);
$$;
CREATE FUNCTION dealercrm._sales_manager(_dealership_id uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = dealercrm, pg_temp AS $$
  SELECT p.id FROM dealercrm.profile p
  WHERE p.dealership_id = _dealership_id AND p.role = 'sales_manager' AND p.is_active
  ORDER BY p.created_at LIMIT 1;
$$;
CREATE FUNCTION dealercrm._setting(_dealership_id uuid, _key text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = dealercrm, pg_temp AS $$
  SELECT s.value FROM dealercrm.setting s WHERE s.dealership_id = _dealership_id AND s.key = _key;
$$;

-- Somma minuti dentro l'orario di lavoro (setting lead_timers.work_hours, fuso del concessionario).
CREATE FUNCTION dealercrm.add_work_minutes(_dealership_id uuid, _from timestamptz, _minutes integer) RETURNS timestamptz
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = dealercrm, pg_temp AS $$
DECLARE
  hours jsonb := dealercrm._setting(_dealership_id, 'lead_timers') -> 'work_hours';
  tz text := coalesce((SELECT d.timezone FROM dealercrm.dealership d WHERE d.id = _dealership_id), 'Europe/Rome');
  t timestamp; d date; win jsonb; s timestamp; e timestamp; avail numeric; left_min integer := _minutes; i integer := 0;
BEGIN
  IF hours IS NULL OR _minutes IS NULL THEN
    RETURN _from + make_interval(mins => coalesce(_minutes, 0));
  END IF;
  t := _from AT TIME ZONE tz;
  WHILE i < 60 LOOP
    i := i + 1;
    d := t::date;
    win := CASE WHEN extract(isodow FROM d) BETWEEN 1 AND 5 THEN hours -> 'mon-fri'
                WHEN extract(isodow FROM d) = 6 THEN hours -> 'sat' END;
    IF win IS NOT NULL AND NOT (coalesce(hours -> 'holidays', '[]'::jsonb) ? d::text) THEN
      s := d + (win ->> 0)::time;
      e := d + (win ->> 1)::time;
      IF t < s THEN t := s; END IF;
      IF t < e THEN
        avail := extract(epoch FROM e - t) / 60;
        IF avail >= left_min THEN
          RETURN (t + make_interval(mins => left_min)) AT TIME ZONE tz;
        END IF;
        left_min := left_min - floor(avail)::integer;
      END IF;
    END IF;
    t := (d + 1)::timestamp;
  END LOOP;
  RETURN t AT TIME ZONE tz;
END $$;

-- Scadenza del timer: i timer brevi (meno di un giorno) contano solo l'orario di lavoro, quelli lunghi i giorni di calendario.
CREATE FUNCTION dealercrm.lead_deadline(_dealership_id uuid, _from timestamptz, _minutes integer) RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = dealercrm, pg_temp AS $$
  SELECT CASE
    WHEN _minutes IS NULL THEN NULL
    WHEN _minutes < 1440 THEN dealercrm.add_work_minutes(_dealership_id, _from, _minutes)
    ELSE _from + make_interval(mins => _minutes) END;
$$;

CREATE FUNCTION dealercrm.lead_timer_minutes(_dealership_id uuid, _status dealercrm.lead_status, _channel dealercrm.lead_channel) RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = dealercrm, pg_temp AS $$
DECLARE cfg jsonb := coalesce(dealercrm._setting(_dealership_id, 'lead_timers'), '{}'::jsonb);
BEGIN
  IF _status = 'ai_qualifying' THEN
    RETURN CASE WHEN _channel IN ('voicemail','phone') THEN 10 ELSE 1440 END;
  END IF;
  IF _status = 'assigned' THEN
    RETURN coalesce((cfg #>> '{escalation_assigned_min,warn_salesperson}')::int, (cfg #>> '{timers_min,assigned}')::int, 15);
  END IF;
  RETURN (cfg -> 'timers_min' ->> _status::text)::int;
END $$;

CREATE FUNCTION dealercrm.lead_next_statuses(_from dealercrm.lead_status) RETURNS dealercrm.lead_status[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _from
    WHEN 'new' THEN ARRAY['ai_qualifying','invalid']
    WHEN 'ai_qualifying' THEN ARRAY['qualified','invalid']
    WHEN 'qualified' THEN ARRAY['assigned']
    WHEN 'assigned' THEN ARRAY['contacted']
    WHEN 'contacted' THEN ARRAY['appointment_set','lost']
    WHEN 'appointment_set' THEN ARRAY['visited','contacted','lost']
    WHEN 'visited' THEN ARRAY['proposal_sent','lost']
    WHEN 'proposal_sent' THEN ARRAY['negotiating','lost']
    WHEN 'negotiating' THEN ARRAY['won','lost']
    ELSE ARRAY[]::text[] END::dealercrm.lead_status[];
$$;

-- ===================================================================== lead
CREATE FUNCTION dealercrm._set_lead_status(_lead_id uuid, _to dealercrm.lead_status, _payload jsonb DEFAULT '{}', _force boolean DEFAULT false)
RETURNS dealercrm.lead
LANGUAGE plpgsql SECURITY DEFINER SET search_path = dealercrm, pg_temp AS $$
DECLARE rec dealercrm.lead; prev dealercrm.lead_status; mins integer; reason dealercrm.lost_reason; first_touch boolean;
  flag text := coalesce(current_setting('dealercrm.status_ok', true), 'off');
BEGIN
  SELECT * INTO rec FROM dealercrm.lead WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'lead non trovata'; END IF;
  prev := rec.status;
  IF NOT _force AND NOT (_to = ANY (dealercrm.lead_next_statuses(prev))) THEN
    RAISE EXCEPTION 'passaggio non consentito: % -> %', prev, _to;
  END IF;
  reason := coalesce((_payload ->> 'lost_reason')::dealercrm.lost_reason, rec.lost_reason);
  IF _to = 'lost' AND reason IS NULL THEN RAISE EXCEPTION 'serve il motivo della perdita'; END IF;
  mins := dealercrm.lead_timer_minutes(rec.dealership_id, _to, rec.channel);
  first_touch := _to = 'contacted' AND rec.first_contact_at IS NULL;

  PERFORM set_config('dealercrm.status_ok', 'on', true);
  UPDATE dealercrm.lead SET
    status = _to,
    status_changed_at = now(),
    status_deadline_at = dealercrm.lead_deadline(rec.dealership_id, now(), mins),
    escalation_level = 0,
    lost_reason = CASE WHEN _to = 'lost' THEN reason ELSE lost_reason END,
    first_contact_at = CASE WHEN first_touch THEN now() ELSE first_contact_at END,
    response_minutes = CASE WHEN first_touch AND assigned_at IS NOT NULL THEN (extract(epoch FROM now() - assigned_at) / 60)::int ELSE response_minutes END,
    last_contact_at = CASE WHEN _to IN ('contacted','appointment_set','visited','proposal_sent','negotiating') THEN now() ELSE last_contact_at END
  WHERE id = _lead_id RETURNING * INTO rec;
  PERFORM set_config('dealercrm.status_ok', flag, true);

  INSERT INTO dealercrm.lead_event (lead_id, actor_id, actor_kind, type, from_status, to_status, payload)
  VALUES (_lead_id, auth.uid(), CASE WHEN auth.uid() IS NULL THEN 'system' ELSE 'user' END::dealercrm.actor_kind,
          'status_change', prev, _to, coalesce(_payload, '{}'::jsonb));
  RETURN rec;
END $$;

-- Assegnazione (sezione 5 della specifica). _to = assegnazione manuale; altrimenti punteggio 40/40/20 con fasce, continuità ed equità.
-- Se la lead era già assegnata è una riassegnazione: esclude il venditore attuale, conta la riassegnazione e fa ripartire il timer.
-- Oltre il massimo di riassegnazioni la lead va al responsabile vendite.
CREATE FUNCTION dealercrm._assign_lead(_lead_id uuid, _to uuid DEFAULT NULL, _why text DEFAULT 'auto')
RETURNS dealercrm.lead
LANGUAGE plpgsql SECURITY DEFINER SET search_path = dealercrm, pg_temp AS $$
DECLARE
  rec dealercrm.lead; prev uuid; band char(1); vehicle_value numeric;
  weights jsonb; params jsonb; timers jsonb; median_rate numeric; total_30 int; hot_30 int;
  chosen uuid; manager uuid; reason jsonb;
BEGIN
  SELECT * INTO rec FROM dealercrm.lead WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'lead non trovata'; END IF;
  prev := rec.assigned_to;
  manager := dealercrm._sales_manager(rec.dealership_id);
  SELECT coalesce(v.sale_price, v.list_price, 0) INTO vehicle_value FROM dealercrm.vehicle v WHERE v.id = rec.vehicle_id;
  band := coalesce(rec.price_band,
    CASE WHEN coalesce(vehicle_value, 0) < 10000 THEN 'A' WHEN vehicle_value < 20000 THEN 'B' WHEN vehicle_value < 35000 THEN 'C' ELSE 'D' END);
  weights := coalesce(dealercrm._setting(rec.dealership_id, 'assignment_weights'), '{"performance":0.4,"rotation":0.4,"load":0.2}');
  params := coalesce(dealercrm._setting(rec.dealership_id, 'assignment_params'), '{"max_open_leads":15,"min_share":0.08,"max_hot_share":0.25,"band_d_top_n":3}');
  timers := coalesce(dealercrm._setting(rec.dealership_id, 'lead_timers'), '{}');

  IF _to IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM dealercrm.profile p WHERE p.id = _to AND p.dealership_id = rec.dealership_id AND p.is_active
                   AND p.role IN ('salesperson','sales_manager')) THEN
      RAISE EXCEPTION 'venditore non valido';
    END IF;
    chosen := _to;
  ELSIF prev IS NOT NULL AND rec.reassignment_count >= coalesce((timers ->> 'max_reassignments')::int, 3) THEN
    chosen := manager;
    _why := 'max_reassignments';
  ELSE
    SELECT count(*) FILTER (WHERE true), count(*) FILTER (WHERE temperature = 'hot') INTO total_30, hot_30
    FROM dealercrm.lead WHERE dealership_id = rec.dealership_id AND assigned_at > now() - interval '30 days';

    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY close_rate) INTO median_rate FROM (
      SELECT CASE WHEN count(*) FILTER (WHERE l.status IN ('won','lost')) = 0 THEN 0
             ELSE count(*) FILTER (WHERE l.status = 'won')::numeric / count(*) FILTER (WHERE l.status IN ('won','lost')) END AS close_rate
      FROM dealercrm.profile p
      LEFT JOIN dealercrm.lead l ON l.assigned_to = p.id AND l.status_changed_at > now() - interval '90 days'
      WHERE p.dealership_id = rec.dealership_id AND p.role = 'salesperson' AND p.is_active
      GROUP BY p.id) m;

    -- continuità: stesso venditore di una lead precedente dello stesso cliente
    SELECT l.assigned_to INTO chosen
    FROM dealercrm.lead l JOIN dealercrm.profile p ON p.id = l.assigned_to
    WHERE l.customer_id = rec.customer_id AND l.id <> rec.id AND l.assigned_to IS DISTINCT FROM prev
      AND p.is_active AND p.is_available AND p.role = 'salesperson' AND band = ANY (p.enabled_bands)
    ORDER BY l.assigned_at DESC NULLS LAST LIMIT 1;

    IF chosen IS NULL THEN
      WITH stats AS (
        SELECT p.id,
          count(l.id) FILTER (WHERE l.status NOT IN ('won','lost','invalid')) AS open_cnt,
          count(l.id) FILTER (WHERE l.assigned_at > now() - interval '30 days') AS received_30,
          count(l.id) FILTER (WHERE l.status = 'won' AND l.status_changed_at > now() - interval '90 days') AS won90,
          count(l.id) FILTER (WHERE l.status IN ('won','lost') AND l.status_changed_at > now() - interval '90 days') AS closed90,
          count(l.id) FILTER (WHERE l.temperature = 'hot' AND l.assigned_at > now() - interval '30 days') AS hot_cnt
        FROM dealercrm.profile p LEFT JOIN dealercrm.lead l ON l.assigned_to = p.id
        WHERE p.dealership_id = rec.dealership_id AND p.role = 'salesperson' AND p.is_active AND p.is_available
          AND band = ANY (p.enabled_bands) AND p.id IS DISTINCT FROM prev
        GROUP BY p.id
      ), scored AS (
        SELECT s.*,
          CASE WHEN closed90 = 0 THEN 0 ELSE won90::numeric / closed90 END AS close_rate,
          CASE WHEN total_30 = 0 THEN 0 ELSE received_30::numeric / total_30 END AS share_30,
            (weights ->> 'performance')::numeric * least(100, (CASE WHEN closed90 = 0 THEN 0 ELSE won90::numeric / closed90 END) * 100)
          + (weights ->> 'rotation')::numeric * (100 - least(100, received_30 * 4))
          + (weights ->> 'load')::numeric * (100 - least(100, open_cnt * 100 / greatest(1, (params ->> 'max_open_leads')::int)))
          AS score
        FROM stats s
        WHERE s.open_cnt < coalesce((params ->> 'max_open_leads')::int, 15)
          AND (band <> 'C' OR (CASE WHEN closed90 = 0 THEN 0 ELSE won90::numeric / closed90 END) >= coalesce(median_rate, 0))
          AND (rec.temperature IS DISTINCT FROM 'hot' OR hot_30 = 0
               OR s.hot_cnt::numeric / hot_30 <= coalesce((params ->> 'max_hot_share')::numeric, 0.25))
      )
      SELECT id INTO chosen FROM scored
      WHERE band <> 'D' OR id IN (SELECT id FROM scored ORDER BY close_rate DESC, score DESC LIMIT coalesce((params ->> 'band_d_top_n')::int, 3))
      ORDER BY (share_30 < coalesce((params ->> 'min_share')::numeric, 0.08)) DESC, score DESC, received_30 ASC
      LIMIT 1;
    END IF;
    chosen := coalesce(chosen, manager);
  END IF;

  reason := jsonb_build_object('why', _why, 'band', band, 'vehicle_value', vehicle_value, 'chosen', chosen,
    'previous', prev, 'median_close_rate', median_rate, 'weights', weights, 'total_30', total_30, 'hot_30', hot_30,
    'by', auth.uid());

  UPDATE dealercrm.lead SET
    assigned_to = chosen, assigned_at = now(), price_band = band, assignment_reason = reason,
    reassignment_count = reassignment_count + CASE WHEN prev IS NOT NULL AND prev IS DISTINCT FROM chosen THEN 1 ELSE 0 END
  WHERE id = _lead_id RETURNING * INTO rec;
  INSERT INTO dealercrm.lead_event (lead_id, actor_id, actor_kind, type, payload)
  VALUES (_lead_id, auth.uid(), CASE WHEN auth.uid() IS NULL THEN 'system' ELSE 'user' END::dealercrm.actor_kind,
          CASE WHEN prev IS NULL THEN 'assigned' ELSE 'reassigned' END, reason);

  IF rec.status = 'qualified' THEN
    rec := dealercrm._set_lead_status(_lead_id, 'assigned', jsonb_build_object('assigned_to', chosen));
  ELSIF rec.status = 'assigned' THEN
    -- riassegnazione: il timer di presa in carico riparte da zero
    UPDATE dealercrm.lead SET status_changed_at = now(), escalation_level = 0,
      status_deadline_at = dealercrm.lead_deadline(dealership_id, now(), dealercrm.lead_timer_minutes(dealership_id, 'assigned', channel))
    WHERE id = _lead_id RETURNING * INTO rec;
  END IF;
  PERFORM dealercrm._notify(chosen, 'lead_assigned', jsonb_build_object('lead_id', _lead_id, 'why', _why));
  RETURN rec;
END $$;

-- Cambio di stato dall'app: responsabile e admin su tutte, il venditore sulle sue.
-- Passando a "qualified" la lead si assegna da sola.
CREATE FUNCTION dealercrm.change_lead_status(_lead_id uuid, _to_status dealercrm.lead_status, _payload jsonb DEFAULT '{}')
RETURNS dealercrm.lead
LANGUAGE plpgsql SECURITY DEFINER SET search_path = dealercrm, pg_temp AS $$
DECLARE rec dealercrm.lead;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    SELECT * INTO rec FROM dealercrm.lead WHERE id = _lead_id;
    IF NOT FOUND OR rec.dealership_id IS DISTINCT FROM dealercrm.my_dealership()
       OR NOT (dealercrm.has_role('admin','sales_manager') OR (dealercrm.has_role('salesperson') AND rec.assigned_to = auth.uid())) THEN
      RAISE EXCEPTION 'non autorizzato' USING ERRCODE = '42501';
    END IF;
  END IF;
  rec := dealercrm._set_lead_status(_lead_id, _to_status, _payload, false);
  IF rec.status = 'qualified' THEN
    rec := dealercrm._assign_lead(_lead_id, NULL, 'qualified');
  END IF;
  RETURN rec;
END $$;

-- Assegnazione o riassegnazione manuale (responsabile vendite, admin). Il motivo si registra.
CREATE FUNCTION dealercrm.assign_lead(_lead_id uuid, _to uuid DEFAULT NULL, _reason text DEFAULT NULL)
RETURNS dealercrm.lead
LANGUAGE plpgsql SECURITY DEFINER SET search_path = dealercrm, pg_temp AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (
       dealercrm.has_role('admin','sales_manager')
       AND EXISTS (SELECT 1 FROM dealercrm.lead l WHERE l.id = _lead_id AND l.dealership_id = dealercrm.my_dealership())) THEN
    RAISE EXCEPTION 'non autorizzato' USING ERRCODE = '42501';
  END IF;
  RETURN dealercrm._assign_lead(_lead_id, _to, coalesce(_reason, CASE WHEN _to IS NULL THEN 'manual_auto' ELSE 'manual' END));
END $$;

-- Timer (pg_cron ogni minuto). Ogni azione sposta o azzera la scadenza: nessuna notifica ripetuta.
CREATE FUNCTION dealercrm.process_lead_timers() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = dealercrm, pg_temp AS $$
DECLARE r dealercrm.lead; cfg jsonb; n integer := 0; assignee_role dealercrm.app_role; payload jsonb;
BEGIN
  FOR r IN
    SELECT l.* FROM dealercrm.lead l
    WHERE l.status NOT IN ('won','lost','invalid')
      AND (l.status_deadline_at < now()
           OR greatest(l.status_changed_at, coalesce(l.last_contact_at, l.status_changed_at)) < now() - interval '1 day'
              * coalesce((dealercrm._setting(l.dealership_id, 'lead_timers') ->> 'auto_lose_days')::int, 30))
    ORDER BY l.status_deadline_at NULLS LAST
    LIMIT 500
  LOOP
    BEGIN
      cfg := coalesce(dealercrm._setting(r.dealership_id, 'lead_timers'), '{}');
      payload := jsonb_build_object('lead_id', r.id, 'status', r.status);
      n := n + 1;

      IF greatest(r.status_changed_at, coalesce(r.last_contact_at, r.status_changed_at))
         < now() - interval '1 day' * coalesce((cfg ->> 'auto_lose_days')::int, 30) THEN
        PERFORM dealercrm._set_lead_status(r.id, 'lost', '{"lost_reason":"no_response","auto":true}', true);
        CONTINUE;
      END IF;

      CASE r.status
        WHEN 'new' THEN
          PERFORM dealercrm._notify_roles(r.dealership_id, ARRAY['sales_manager','admin']::dealercrm.app_role[], 'lead_waiting', payload);
          UPDATE dealercrm.lead SET status_deadline_at = NULL WHERE id = r.id;
        WHEN 'ai_qualifying' THEN
          -- l'IA non ha finito in tempo: passa a una persona
          PERFORM dealercrm._set_lead_status(r.id, 'qualified', '{"reason":"ai_timeout"}');
          PERFORM dealercrm._assign_lead(r.id, NULL, 'ai_timeout');
        WHEN 'qualified' THEN
          PERFORM dealercrm._assign_lead(r.id, NULL, 'qualified_timeout');
        WHEN 'assigned' THEN
          SELECT p.role INTO assignee_role FROM dealercrm.profile p WHERE p.id = r.assigned_to;
          IF r.escalation_level = 0 THEN
            PERFORM dealercrm._notify(r.assigned_to, 'lead_not_taken', payload);
            UPDATE dealercrm.lead SET escalation_level = 1,
              status_deadline_at = dealercrm.lead_deadline(r.dealership_id, r.status_changed_at, coalesce((cfg #>> '{escalation_assigned_min,warn_manager}')::int, 30))
            WHERE id = r.id;
          ELSIF r.escalation_level = 1 THEN
            PERFORM dealercrm._notify_roles(r.dealership_id, ARRAY['sales_manager']::dealercrm.app_role[], 'lead_not_taken_manager',
              payload || jsonb_build_object('assigned_to', r.assigned_to));
            UPDATE dealercrm.lead SET escalation_level = 2,
              status_deadline_at = dealercrm.lead_deadline(r.dealership_id, r.status_changed_at, coalesce((cfg #>> '{escalation_assigned_min,reassign}')::int, 60))
            WHERE id = r.id;
          ELSIF assignee_role = 'salesperson' THEN
            PERFORM dealercrm._assign_lead(r.id, NULL, 'not_taken');
          ELSE
            -- già al responsabile: niente altri giri
            UPDATE dealercrm.lead SET status_deadline_at = NULL WHERE id = r.id;
          END IF;
        ELSE
          -- contattata, appuntamento, visita, proposta, trattativa: un promemoria, poi il timer si ferma
          PERFORM dealercrm._notify(coalesce(r.assigned_to, dealercrm._sales_manager(r.dealership_id)), 'lead_reminder', payload);
          IF r.status = 'negotiating' THEN
            PERFORM dealercrm._notify_roles(r.dealership_id, ARRAY['sales_manager']::dealercrm.app_role[], 'lead_reminder', payload);
          END IF;
          UPDATE dealercrm.lead SET status_deadline_at = NULL WHERE id = r.id;
      END CASE;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'timer lead %: %', r.id, SQLERRM;
    END;
  END LOOP;
  RETURN n;
END $$;

-- ===================================================================== veicoli
CREATE FUNCTION dealercrm._set_vehicle_status(_vehicle_id uuid, _to dealercrm.vehicle_status, _payload jsonb DEFAULT '{}')
RETURNS dealercrm.vehicle
LANGUAGE plpgsql SECURITY DEFINER SET search_path = dealercrm, pg_temp AS $$
DECLARE rec dealercrm.vehicle; prev dealercrm.vehicle_status; flag text := coalesce(current_setting('dealercrm.status_ok', true), 'off');
BEGIN
  SELECT * INTO rec FROM dealercrm.vehicle WHERE id = _vehicle_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'veicolo non trovato'; END IF;
  prev := rec.status;
  IF prev = _to THEN RETURN rec; END IF;
  PERFORM set_config('dealercrm.status_ok', 'on', true);
  UPDATE dealercrm.vehicle SET status = _to, status_changed_at = now() WHERE id = _vehicle_id RETURNING * INTO rec;
  PERFORM set_config('dealercrm.status_ok', flag, true);
  INSERT INTO dealercrm.vehicle_event (vehicle_id, actor_id, type, from_status, to_status, payload)
  VALUES (_vehicle_id, auth.uid(), 'status_change', prev, _to, coalesce(_payload, '{}'::jsonb));
  RETURN rec;
END $$;

CREATE FUNCTION dealercrm.change_vehicle_status(_vehicle_id uuid, _to_status dealercrm.vehicle_status, _payload jsonb DEFAULT '{}')
RETURNS dealercrm.vehicle
LANGUAGE plpgsql SECURITY DEFINER SET search_path = dealercrm, pg_temp AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (dealercrm.has_role('admin','used_manager') AND dealercrm.vehicle_visible(_vehicle_id)) THEN
    RAISE EXCEPTION 'non autorizzato' USING ERRCODE = '42501';
  END IF;
  RETURN dealercrm._set_vehicle_status(_vehicle_id, _to_status, _payload);
END $$;

CREATE FUNCTION dealercrm.set_vehicle_yard_position(_vehicle_id uuid, _slot_id uuid, _yard_status dealercrm.yard_status)
RETURNS dealercrm.vehicle
LANGUAGE plpgsql SECURITY DEFINER SET search_path = dealercrm, pg_temp AS $$
DECLARE rec dealercrm.vehicle;
BEGIN
  IF NOT (dealercrm.has_role('admin','yard','used_manager') AND dealercrm.vehicle_visible(_vehicle_id)) THEN
    RAISE EXCEPTION 'non autorizzato' USING ERRCODE = '42501';
  END IF;
  IF _slot_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM dealercrm.yard_slot s JOIN dealercrm.yard_zone z ON z.id = s.zone_id
    WHERE s.id = _slot_id AND z.dealership_id = dealercrm.my_dealership()) THEN
    RAISE EXCEPTION 'stallo non trovato';
  END IF;
  UPDATE dealercrm.vehicle SET yard_slot_id = _slot_id, yard_status = _yard_status, yard_verified_at = now(), yard_verified_by = auth.uid()
  WHERE id = _vehicle_id RETURNING * INTO rec;
  INSERT INTO dealercrm.vehicle_event (vehicle_id, actor_id, type, payload)
  VALUES (_vehicle_id, auth.uid(), 'yard_position', jsonb_build_object('slot_id', _slot_id, 'yard_status', _yard_status));
  RETURN rec;
END $$;

-- Stallo più vicino a un punto toccato sulla mappa (il raggio si controlla nel client)
CREATE FUNCTION dealercrm.yard_slot_nearest(_lat double precision, _lng double precision, _radius_m double precision DEFAULT 15)
RETURNS TABLE (slot_id uuid, code text, zone_code text, distance_m double precision)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = dealercrm, pg_temp AS $$
  SELECT s.id, s.code, z.code,
         2 * 6371000 * asin(sqrt(power(sin(radians(s.lat - _lat) / 2), 2)
           + cos(radians(_lat)) * cos(radians(s.lat)) * power(sin(radians(s.lng - _lng) / 2), 2))) AS distance_m
  FROM dealercrm.yard_slot s JOIN dealercrm.yard_zone z ON z.id = s.zone_id
  WHERE s.lat IS NOT NULL AND s.lng IS NOT NULL AND z.dealership_id = dealercrm.my_dealership()
  ORDER BY distance_m LIMIT 1;
$$;

CREATE FUNCTION dealercrm.compare_conditions(_vehicle_id uuid, _from dealercrm.condition_phase, _to dealercrm.condition_phase)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = dealercrm, pg_temp AS $$
DECLARE a dealercrm.vehicle_condition; b dealercrm.vehicle_condition; delta integer;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT dealercrm.vehicle_visible(_vehicle_id) THEN
    RAISE EXCEPTION 'non autorizzato' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO a FROM dealercrm.vehicle_condition WHERE vehicle_id = _vehicle_id AND phase = _from ORDER BY taken_at DESC LIMIT 1;
  SELECT * INTO b FROM dealercrm.vehicle_condition WHERE vehicle_id = _vehicle_id AND phase = _to ORDER BY taken_at DESC LIMIT 1;
  IF a.id IS NULL OR b.id IS NULL THEN RETURN jsonb_build_object('error', 'missing_phase'); END IF;
  delta := coalesce(b.mileage_km, 0) - coalesce(a.mileage_km, 0);
  RETURN jsonb_build_object(
    'from_phase', _from, 'to_phase', _to,
    'fuel_changed', a.fuel_level IS DISTINCT FROM b.fuel_level, 'from_fuel', a.fuel_level, 'to_fuel', b.fuel_level,
    'mileage_delta', delta, 'mileage_unjustified', delta > 50,
    'new_damages', (SELECT coalesce(jsonb_agg(jsonb_build_object('zone', d.zone, 'damage_type', d.damage_type, 'severity', d.severity)), '[]')
                    FROM dealercrm.vehicle_damage d WHERE d.condition_id = b.id
                      AND NOT EXISTS (SELECT 1 FROM dealercrm.vehicle_damage x WHERE x.condition_id = a.id AND x.zone = d.zone AND x.damage_type = d.damage_type)),
    'repaired_damages', (SELECT coalesce(jsonb_agg(jsonb_build_object('zone', d.zone, 'damage_type', d.damage_type)), '[]')
                         FROM dealercrm.vehicle_damage d WHERE d.condition_id = b.id AND d.repaired));
END $$;

-- ===================================================================== pratiche
-- Alla creazione: voce "margine veicolo" stimata (prezzo - costo - ricondizionamento); con caparra l'auto diventa riservata.
CREATE FUNCTION dealercrm.on_deal_created() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = dealercrm, pg_temp AS $$
DECLARE v dealercrm.vehicle; recond numeric;
BEGIN
  SELECT * INTO v FROM dealercrm.vehicle WHERE id = NEW.vehicle_id;
  SELECT coalesce(sum(w.cost), 0) INTO recond FROM dealercrm.vehicle_work w WHERE w.vehicle_id = NEW.vehicle_id;
  INSERT INTO dealercrm.deal_item (deal_id, type, kind, estimated, status, source)
  VALUES (NEW.id, 'vehicle_margin', 'revenue',
          coalesce(NEW.sale_price, v.sale_price, v.list_price, 0) - coalesce(v.purchase_cost, 0) - recond, 'planned', 'auto');
  IF coalesce(NEW.deposit, 0) > 0 AND v.status IN ('ready','published') THEN
    PERFORM dealercrm._set_vehicle_status(NEW.vehicle_id, 'reserved', jsonb_build_object('deal_id', NEW.id));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER deal_after_insert AFTER INSERT ON dealercrm.deal FOR EACH ROW EXECUTE FUNCTION dealercrm.on_deal_created();

CREATE FUNCTION dealercrm.on_deal_deposit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = dealercrm, pg_temp AS $$
BEGIN
  IF coalesce(NEW.deposit, 0) > 0 AND coalesce(OLD.deposit, 0) = 0
     AND (SELECT status FROM dealercrm.vehicle WHERE id = NEW.vehicle_id) IN ('ready','published') THEN
    PERFORM dealercrm._set_vehicle_status(NEW.vehicle_id, 'reserved', jsonb_build_object('deal_id', NEW.id));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER deal_after_update_deposit AFTER UPDATE OF deposit ON dealercrm.deal FOR EACH ROW EXECUTE FUNCTION dealercrm.on_deal_deposit();

-- Avanzamento della pratica: solo in avanti, "signed" fa la firma (sezione 6), "cancelled" libera l'auto.
CREATE FUNCTION dealercrm.set_deal_status(_deal_id uuid, _to dealercrm.deal_status)
RETURNS dealercrm.deal
LANGUAGE plpgsql SECURITY DEFINER SET search_path = dealercrm, pg_temp AS $$
DECLARE
  rec dealercrm.deal; steps dealercrm.deal_status[] := ARRAY['open','quote_sent','contract_pending','signed','payment_pending','transfer_documents','delivered','closed'];
  from_i int; to_i int; snapshot jsonb; l dealercrm.listing; v dealercrm.vehicle;
  flag text := coalesce(current_setting('dealercrm.status_ok', true), 'off');
BEGIN
  SELECT * INTO rec FROM dealercrm.deal WHERE id = _deal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'pratica non trovata'; END IF;
  IF auth.uid() IS NOT NULL AND NOT (
       rec.dealership_id = dealercrm.my_dealership()
       AND (dealercrm.has_role('admin','sales_manager','accounting','finance_insurance')
            OR (dealercrm.has_role('salesperson') AND rec.salesperson_id = auth.uid()))) THEN
    RAISE EXCEPTION 'non autorizzato' USING ERRCODE = '42501';
  END IF;

  from_i := array_position(steps, rec.status);
  IF _to = 'cancelled' THEN
    IF rec.status IN ('delivered','closed','cancelled') THEN RAISE EXCEPTION 'pratica non annullabile nello stato %', rec.status; END IF;
  ELSE
    to_i := array_position(steps, _to);
    IF from_i IS NULL OR to_i IS NULL OR to_i <= from_i THEN
      RAISE EXCEPTION 'passaggio non consentito: % -> %', rec.status, _to;
    END IF;
    IF from_i < 4 AND to_i > 4 THEN RAISE EXCEPTION 'prima la pratica va firmata'; END IF;
  END IF;

  PERFORM set_config('dealercrm.status_ok', 'on', true);

  IF _to = 'signed' THEN
    SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.created_at), '[]') INTO snapshot FROM dealercrm.deal_item i WHERE i.deal_id = _deal_id;
    UPDATE dealercrm.deal SET status = 'signed', signed_at = coalesce(signed_at, now()) WHERE id = _deal_id RETURNING * INTO rec;
    PERFORM dealercrm._set_vehicle_status(rec.vehicle_id, 'sold', jsonb_build_object('deal_id', _deal_id));
    IF rec.lead_id IS NOT NULL THEN
      UPDATE dealercrm.lead SET deal_id = _deal_id WHERE id = rec.lead_id;
      IF (SELECT status FROM dealercrm.lead WHERE id = rec.lead_id) NOT IN ('won','lost','invalid') THEN
        PERFORM dealercrm._set_lead_status(rec.lead_id, 'won', jsonb_build_object('deal_id', _deal_id), true);
      END IF;
    END IF;
    FOR l IN SELECT * FROM dealercrm.listing WHERE vehicle_id = rec.vehicle_id AND status NOT IN ('withdrawn') LOOP
      INSERT INTO dealercrm.outbox (dealership_id, integration, action, payload, dedup_key)
      VALUES (rec.dealership_id, l.portal, 'withdraw', jsonb_build_object('listing_id', l.id, 'external_id', l.external_id),
              l.portal || ':withdraw:' || l.id)
      ON CONFLICT (dedup_key) DO NOTHING;
    END LOOP;
    -- importi stimati congelati come riferimento; il documento si genera con generate-contract
    INSERT INTO dealercrm.contract (deal_id, data)
    VALUES (_deal_id, jsonb_build_object('sale_price', rec.sale_price, 'deposit', rec.deposit, 'items_estimated_snapshot', snapshot, 'frozen_at', now()));
    PERFORM dealercrm._notify_roles(rec.dealership_id, ARRAY['accounting','finance_insurance','admin']::dealercrm.app_role[], 'deal_signed',
      jsonb_build_object('deal_id', _deal_id, 'next', ARRAY['transfer_documents','accounting','fi']));
  ELSIF _to = 'delivered' THEN
    UPDATE dealercrm.deal SET status = 'delivered', delivered_at = coalesce(delivered_at, now()) WHERE id = _deal_id RETURNING * INTO rec;
    PERFORM dealercrm._set_vehicle_status(rec.vehicle_id, 'delivered', jsonb_build_object('deal_id', _deal_id));
  ELSIF _to = 'cancelled' THEN
    UPDATE dealercrm.deal SET status = 'cancelled' WHERE id = _deal_id RETURNING * INTO rec;
    SELECT * INTO v FROM dealercrm.vehicle WHERE id = rec.vehicle_id;
    IF v.status IN ('reserved','sold') AND NOT EXISTS (
         SELECT 1 FROM dealercrm.deal d WHERE d.vehicle_id = rec.vehicle_id AND d.id <> rec.id AND d.status NOT IN ('cancelled','closed')) THEN
      PERFORM dealercrm._set_vehicle_status(rec.vehicle_id,
        CASE WHEN EXISTS (SELECT 1 FROM dealercrm.listing x WHERE x.vehicle_id = rec.vehicle_id AND x.status IN ('published','suspended'))
             THEN 'published' ELSE 'ready' END::dealercrm.vehicle_status,
        jsonb_build_object('deal_id', _deal_id, 'reason', 'deal_cancelled'));
    END IF;
  ELSE
    UPDATE dealercrm.deal SET status = _to WHERE id = _deal_id RETURNING * INTO rec;
  END IF;

  PERFORM set_config('dealercrm.status_ok', flag, true);
  RETURN rec;
END $$;

-- Nome storico usato dall'app: firma della pratica
CREATE FUNCTION dealercrm.on_deal_signed(_deal_id uuid) RETURNS dealercrm.deal
LANGUAGE sql SECURITY DEFINER SET search_path = dealercrm, pg_temp AS $$
  SELECT dealercrm.set_deal_status(_deal_id, 'signed');
$$;

-- Outbox dei portali con adattatori finti (FEATURE_PORTALS_REAL spento): applica l'esito direttamente sull'annuncio.
CREATE FUNCTION dealercrm.process_outbox() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = dealercrm, pg_temp AS $$
DECLARE r dealercrm.outbox; n integer := 0;
BEGIN
  FOR r IN SELECT * FROM dealercrm.outbox
           WHERE status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= now())
           ORDER BY created_at LIMIT 200 FOR UPDATE SKIP LOCKED LOOP
    IF r.payload ? 'listing_id' AND r.action IN ('withdraw','suspend','publish') THEN
      UPDATE dealercrm.listing SET
        status = CASE r.action WHEN 'withdraw' THEN 'withdrawn' WHEN 'suspend' THEN 'suspended' ELSE 'published' END::dealercrm.listing_status,
        external_id = coalesce(external_id, 'mock-' || left(id::text, 8)),
        last_synced_at = now(), last_error = NULL
      WHERE id = (r.payload ->> 'listing_id')::uuid;
      UPDATE dealercrm.outbox SET status = 'sent', attempts = attempts + 1, last_error = NULL WHERE id = r.id;
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END $$;

-- ===================================================================== Fatture in Cloud
CREATE FUNCTION dealercrm.build_invoice_payload(_deal_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = dealercrm, pg_temp AS $$
DECLARE
  d dealercrm.deal; c dealercrm.customer; v dealercrm.vehicle; cfg jsonb; items jsonb; services jsonb;
  vat_std int; vat_margin int; price numeric; extras numeric; balance numeric;
BEGIN
  SELECT * INTO d FROM dealercrm.deal WHERE id = _deal_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'pratica non trovata'; END IF;
  SELECT * INTO c FROM dealercrm.customer WHERE id = d.customer_id;
  SELECT * INTO v FROM dealercrm.vehicle WHERE id = d.vehicle_id;
  cfg := coalesce(dealercrm._setting(d.dealership_id, 'fatture_in_cloud'), '{}');
  vat_std := (cfg ->> 'vat_id_standard')::int;
  vat_margin := (cfg ->> 'vat_id_margin')::int;
  price := coalesce(d.sale_price, 0);

  -- veicolo in regime del margine (IVA non esposta), poi i servizi accessori con IVA ordinaria scorporata
  items := jsonb_build_array(jsonb_build_object(
    'name', concat_ws(' ', v.make, v.model, v.trim),
    'description', format('Targa %s, telaio %s, immatricolazione %s, km %s. Veicolo usato, regime del margine art. 36 D.L. 41/1995.',
                          v.plate, coalesce(v.vin, '-'), coalesce(to_char(v.first_registration, 'DD/MM/YYYY'), '-'), coalesce(v.mileage_km::text, '-')),
    'qty', 1, 'net_price', price, 'vat', jsonb_build_object('id', vat_margin), 'not_taxable', vat_margin IS NULL));

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'name', CASE i.type WHEN 'gps' THEN 'Antifurto satellitare' WHEN 'cvt' THEN 'Cristalli (CVT)' WHEN 'etching' THEN 'Marchiatura antifurto'
                               WHEN 'extended_warranty' THEN 'Garanzia estesa' WHEN 'fees' THEN 'Spese di gestione pratica' ELSE i.type::text END,
           'qty', 1, 'net_price', round(coalesce(i.actual, i.estimated, 0) / 1.22, 2), 'vat', jsonb_build_object('id', vat_std))), '[]'),
         coalesce(sum(coalesce(i.actual, i.estimated, 0)), 0)
  INTO services, extras
  FROM dealercrm.deal_item i
  WHERE i.deal_id = _deal_id AND i.kind = 'revenue' AND i.type IN ('gps','cvt','etching','extended_warranty','fees')
    AND coalesce(i.actual, i.estimated, 0) > 0;
  items := items || services;

  balance := price + extras - coalesce(d.deposit, 0) - coalesce((d.trade_in ->> 'value')::numeric, 0) - coalesce((d.financing ->> 'amount')::numeric, 0);

  RETURN jsonb_build_object('data', jsonb_strip_nulls(jsonb_build_object(
    'type', 'invoice',
    'entity', jsonb_build_object('name', concat_ws(' ', c.first_name, c.last_name), 'address_city', c.city, 'country', 'Italia',
                                 'e_invoice', (cfg ->> 'e_invoice')::boolean, 'ei_code', '0000000'),
    'date', to_char(current_date, 'YYYY-MM-DD'),
    'numeration', cfg ->> 'numeration',
    'subject', format('Vendita %s %s targa %s - pratica %s', v.make, v.model, v.plate, _deal_id),
    'visible_subject', format('Vendita veicolo %s %s targa %s', v.make, v.model, v.plate),
    'currency', jsonb_build_object('id', 'EUR'),
    'language', jsonb_build_object('code', 'it', 'name', 'Italiano'),
    'e_invoice', (cfg ->> 'e_invoice')::boolean,
    'ei_data', jsonb_build_object('vat_kind', cfg ->> 'vat_kind', 'payment_method', cfg ->> 'ei_payment_method'),
    'items_list', items,
    'payments_list', jsonb_build_array(
       CASE WHEN coalesce(d.deposit, 0) > 0 THEN jsonb_build_object('amount', d.deposit, 'due_date', to_char(current_date, 'YYYY-MM-DD'), 'status', 'paid',
            'payment_account', jsonb_build_object('id', (cfg ->> 'payment_account_id')::int)) END,
       jsonb_build_object('amount', greatest(balance, 0), 'due_date', to_char(current_date + 30, 'YYYY-MM-DD'), 'status', 'not_paid')) - 'null',
    'payment_method', jsonb_build_object('id', (cfg ->> 'payment_method_id')::int))),
    'options', jsonb_build_object('fix_payments', true));
END $$;

-- Crea la riga fattura in coda; la invia la Edge Function fic-invoice
CREATE FUNCTION dealercrm.request_invoice(_deal_id uuid, _kind dealercrm.invoice_kind DEFAULT 'invoice')
RETURNS dealercrm.invoice
LANGUAGE plpgsql SECURITY DEFINER SET search_path = dealercrm, pg_temp AS $$
DECLARE d dealercrm.deal; inv dealercrm.invoice;
BEGIN
  SELECT * INTO d FROM dealercrm.deal WHERE id = _deal_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'pratica non trovata'; END IF;
  IF auth.uid() IS NOT NULL AND NOT (dealercrm.has_role('admin','owner','accounting') AND d.dealership_id = dealercrm.my_dealership()) THEN
    RAISE EXCEPTION 'non autorizzato' USING ERRCODE = '42501';
  END IF;
  INSERT INTO dealercrm.invoice (dealership_id, deal_id, kind, status, payload, dry_run, requested_by, is_demo)
  VALUES (d.dealership_id, _deal_id, _kind, 'queued', dealercrm.build_invoice_payload(_deal_id),
          coalesce((dealercrm._setting(d.dealership_id, 'fatture_in_cloud') ->> 'dry_run')::boolean, true), auth.uid(), d.is_demo)
  RETURNING * INTO inv;
  RETURN inv;
END $$;

-- ===================================================================== dispositivi
-- Registra il dispositivo al login (in attesa di approvazione) e aggiorna l'ultimo accesso.
CREATE FUNCTION dealercrm.register_device(_install_id text, _name text DEFAULT NULL)
RETURNS dealercrm.device
LANGUAGE plpgsql SECURITY DEFINER SET search_path = dealercrm, pg_temp AS $$
DECLARE rec dealercrm.device;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dealercrm.profile p WHERE p.id = auth.uid() AND p.is_active) THEN
    RAISE EXCEPTION 'utente non attivo' USING ERRCODE = '42501';
  END IF;
  IF coalesce(btrim(_install_id), '') = '' THEN RAISE EXCEPTION 'install_id mancante'; END IF;
  SELECT * INTO rec FROM dealercrm.device WHERE install_id = _install_id;
  IF FOUND AND rec.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'dispositivo già registrato da un altro utente' USING ERRCODE = '42501';
  END IF;
  IF FOUND THEN
    UPDATE dealercrm.device SET last_seen_at = now() WHERE id = rec.id RETURNING * INTO rec;
  ELSE
    INSERT INTO dealercrm.device (user_id, install_id, name, status) VALUES (auth.uid(), _install_id, left(_name, 80), 'pending') RETURNING * INTO rec;
  END IF;
  UPDATE dealercrm.profile SET last_seen_at = now() WHERE id = auth.uid();
  RETURN rec;
END $$;

-- ===================================================================== viste
-- Veicoli senza costi: per tutti i ruoli (il filtro sostituisce la RLS, la vista gira come proprietario)
CREATE VIEW dealercrm.vehicle_public WITH (security_barrier = true) AS
SELECT v.id, v.dealership_id, v.plate, v.vin, v.make, v.model, v.trim, v.kind, v.body_type, v.first_registration, v.mileage_km,
       v.fuel_type, v.gearbox, v.power_kw, v.color, v.emission_class, v.previous_owners, v.supplier_id, v.list_price, v.sale_price,
       v.entry_date, v.status, v.status_changed_at, v.yard_slot_id, v.yard_status, v.yard_verified_at, v.notes, v.is_demo, v.created_at,
       greatest(0, current_date - coalesce(v.entry_date, v.created_at::date))::integer AS days_in_stock
FROM dealercrm.vehicle v
WHERE v.dealership_id = dealercrm.my_dealership();

-- Con i costi: rispetta la RLS di vehicle (solo i ruoli che leggono i costi)
CREATE VIEW dealercrm.vehicle_stock WITH (security_invoker = true) AS
SELECT v.id, v.dealership_id, v.plate, v.vin, v.make, v.model, v.trim, v.kind, v.status, v.list_price, v.sale_price, v.purchase_cost, v.entry_date, v.is_demo,
       greatest(0, current_date - coalesce(v.entry_date, v.created_at::date))::integer AS days_in_stock,
       coalesce((SELECT sum(w.cost) FROM dealercrm.vehicle_work w WHERE w.vehicle_id = v.id), 0)::numeric(12,2) AS reconditioning_cost
FROM dealercrm.vehicle v;

CREATE VIEW dealercrm.deal_margin WITH (security_invoker = true) AS
SELECT d.id AS deal_id, d.dealership_id, d.vehicle_id, d.status, d.sale_price,
  coalesce(sum(i.estimated) FILTER (WHERE i.kind = 'revenue'), 0) AS estimated_revenue,
  coalesce(sum(i.estimated) FILTER (WHERE i.kind = 'cost'), 0) AS estimated_cost,
  coalesce(sum(coalesce(i.actual, i.estimated)) FILTER (WHERE i.kind = 'revenue'), 0) AS actual_revenue,
  coalesce(sum(coalesce(i.actual, i.estimated)) FILTER (WHERE i.kind = 'cost'), 0) AS actual_cost,
  coalesce(sum(i.estimated) FILTER (WHERE i.kind = 'revenue'), 0) - coalesce(sum(i.estimated) FILTER (WHERE i.kind = 'cost'), 0) AS estimated_margin,
  coalesce(sum(coalesce(i.actual, i.estimated)) FILTER (WHERE i.kind = 'revenue'), 0) - coalesce(sum(coalesce(i.actual, i.estimated)) FILTER (WHERE i.kind = 'cost'), 0) AS actual_margin
FROM dealercrm.deal d LEFT JOIN dealercrm.deal_item i ON i.deal_id = d.id
GROUP BY d.id;

CREATE VIEW dealercrm.lead_open WITH (security_invoker = true) AS
SELECT l.*, CASE WHEN l.status_deadline_at IS NULL THEN NULL ELSE extract(epoch FROM l.status_deadline_at - now())::integer END AS remaining_seconds
FROM dealercrm.lead l WHERE l.status NOT IN ('won','lost','invalid');

CREATE VIEW dealercrm.salesperson_stats WITH (security_invoker = true) AS
SELECT p.id AS salesperson_id, p.full_name, p.dealership_id,
  (SELECT count(*) FROM dealercrm.lead l WHERE l.assigned_to = p.id AND l.assigned_at > now() - interval '30 days') AS leads_received_30,
  (SELECT count(*) FROM dealercrm.appointment a WHERE a.salesperson_id = p.id AND a.status IN ('scheduled','confirmed','done')) AS appointments,
  (SELECT count(*) FROM dealercrm.lead l WHERE l.assigned_to = p.id AND l.status = 'won' AND l.status_changed_at > now() - interval '90 days') AS wins_90,
  (SELECT CASE WHEN count(*) FILTER (WHERE l.status IN ('won','lost')) = 0 THEN 0
          ELSE round(count(*) FILTER (WHERE l.status = 'won')::numeric / count(*) FILTER (WHERE l.status IN ('won','lost')), 3) END
   FROM dealercrm.lead l WHERE l.assigned_to = p.id AND l.status_changed_at > now() - interval '90 days') AS close_rate_90,
  (SELECT round(avg(l.response_minutes)) FROM dealercrm.lead l WHERE l.assigned_to = p.id AND l.response_minutes IS NOT NULL) AS avg_response_minutes
FROM dealercrm.profile p WHERE p.role = 'salesperson';

-- Stato del collegamento a Fatture in Cloud senza i token
CREATE VIEW dealercrm.fic_connection_status WITH (security_barrier = true) AS
SELECT c.dealership_id, c.company_id, c.company_name, c.connected_at, c.expires_at, c.last_error, (c.access_token IS NOT NULL) AS connected
FROM dealercrm.fic_connection c
WHERE c.dealership_id = dealercrm.my_dealership() AND dealercrm.has_role('admin','owner','accounting');

-- ===================================================================== RLS
DO $$ DECLARE t text; BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'dealercrm' LOOP
    EXECUTE format('ALTER TABLE dealercrm.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

CREATE POLICY sel ON dealercrm.dealership FOR SELECT TO authenticated USING (id = (SELECT dealercrm.my_dealership()));
CREATE POLICY upd ON dealercrm.dealership FOR UPDATE TO authenticated
  USING (id = (SELECT dealercrm.my_dealership()) AND (SELECT dealercrm.has_role('admin')));

-- profilo: ognuno legge il proprio (serve anche prima dell'approvazione del dispositivo); solo l'admin scrive
CREATE POLICY sel ON dealercrm.profile FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()) OR dealership_id = (SELECT dealercrm.my_dealership()));
CREATE POLICY ins ON dealercrm.profile FOR INSERT TO authenticated
  WITH CHECK (dealership_id = (SELECT dealercrm.my_dealership()) AND (SELECT dealercrm.has_role('admin')));
CREATE POLICY upd ON dealercrm.profile FOR UPDATE TO authenticated
  USING (dealership_id = (SELECT dealercrm.my_dealership()) AND (SELECT dealercrm.has_role('admin')))
  WITH CHECK (dealership_id = (SELECT dealercrm.my_dealership()));

-- dispositivi: l'utente vede i suoi; solo l'admin approva e revoca (la registrazione passa da register_device)
CREATE POLICY sel ON dealercrm.device FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid())
         OR ((SELECT dealercrm.has_role('admin')) AND EXISTS (SELECT 1 FROM dealercrm.profile p WHERE p.id = user_id AND p.dealership_id = (SELECT dealercrm.my_dealership()))));
CREATE POLICY upd ON dealercrm.device FOR UPDATE TO authenticated
  USING ((SELECT dealercrm.has_role('admin')) AND EXISTS (SELECT 1 FROM dealercrm.profile p WHERE p.id = user_id AND p.dealership_id = (SELECT dealercrm.my_dealership())))
  WITH CHECK (EXISTS (SELECT 1 FROM dealercrm.profile p WHERE p.id = user_id AND p.dealership_id = (SELECT dealercrm.my_dealership())));

CREATE POLICY sel ON dealercrm.setting FOR SELECT TO authenticated USING (dealership_id = (SELECT dealercrm.my_dealership()));
CREATE POLICY upd ON dealercrm.setting FOR UPDATE TO authenticated
  USING (dealership_id = (SELECT dealercrm.my_dealership()) AND dealercrm.can_write_setting_key(key))
  WITH CHECK (dealership_id = (SELECT dealercrm.my_dealership()) AND dealercrm.can_write_setting_key(key));
CREATE POLICY sel ON dealercrm.setting_history FOR SELECT TO authenticated
  USING ((SELECT dealercrm.has_role('admin','owner','sales_manager'))
         AND EXISTS (SELECT 1 FROM dealercrm.setting s WHERE s.id = setting_id AND s.dealership_id = (SELECT dealercrm.my_dealership())));

CREATE POLICY sel ON dealercrm.supplier FOR SELECT TO authenticated
  USING (dealership_id = (SELECT dealercrm.my_dealership()) AND (SELECT dealercrm.has_role('admin','owner','sales_manager','used_manager','accounting')));
CREATE POLICY wr ON dealercrm.supplier FOR ALL TO authenticated
  USING (dealership_id = (SELECT dealercrm.my_dealership()) AND (SELECT dealercrm.has_role('admin','used_manager')))
  WITH CHECK (dealership_id = (SELECT dealercrm.my_dealership()) AND (SELECT dealercrm.has_role('admin','used_manager')));

CREATE POLICY sel ON dealercrm.yard_zone FOR SELECT TO authenticated
  USING (dealership_id = (SELECT dealercrm.my_dealership()) AND (SELECT dealercrm.has_role('admin','owner','sales_manager','salesperson','used_manager','reconditioning','yard')));
CREATE POLICY wr ON dealercrm.yard_zone FOR ALL TO authenticated
  USING (dealership_id = (SELECT dealercrm.my_dealership()) AND (SELECT dealercrm.has_role('admin','yard')))
  WITH CHECK (dealership_id = (SELECT dealercrm.my_dealership()) AND (SELECT dealercrm.has_role('admin','yard')));
CREATE POLICY sel ON dealercrm.yard_slot FOR SELECT TO authenticated
  USING ((SELECT dealercrm.has_role('admin','owner','sales_manager','salesperson','used_manager','reconditioning','yard'))
         AND EXISTS (SELECT 1 FROM dealercrm.yard_zone z WHERE z.id = zone_id AND z.dealership_id = (SELECT dealercrm.my_dealership())));
CREATE POLICY wr ON dealercrm.yard_slot FOR ALL TO authenticated
  USING ((SELECT dealercrm.has_role('admin','yard'))
         AND EXISTS (SELECT 1 FROM dealercrm.yard_zone z WHERE z.id = zone_id AND z.dealership_id = (SELECT dealercrm.my_dealership())))
  WITH CHECK (EXISTS (SELECT 1 FROM dealercrm.yard_zone z WHERE z.id = zone_id AND z.dealership_id = (SELECT dealercrm.my_dealership())));

-- veicolo con i costi: solo i ruoli che leggono i costi (gli altri usano vehicle_public)
CREATE POLICY sel ON dealercrm.vehicle FOR SELECT TO authenticated
  USING (dealership_id = (SELECT dealercrm.my_dealership()) AND (SELECT dealercrm.has_role('admin','owner','sales_manager','used_manager','accounting','finance_insurance')));
CREATE POLICY wr ON dealercrm.vehicle FOR ALL TO authenticated
  USING (dealership_id = (SELECT dealercrm.my_dealership()) AND (SELECT dealercrm.has_role('admin','used_manager')))
  WITH CHECK (dealership_id = (SELECT dealercrm.my_dealership()) AND (SELECT dealercrm.has_role('admin','used_manager')));

CREATE POLICY sel ON dealercrm.vehicle_event FOR SELECT TO authenticated USING (dealercrm.vehicle_visible(vehicle_id));
CREATE POLICY sel ON dealercrm.vehicle_work FOR SELECT TO authenticated
  USING (dealercrm.vehicle_visible(vehicle_id) AND (cost IS NULL OR (SELECT dealercrm.has_role('admin','owner','sales_manager','used_manager','accounting','finance_insurance'))));
CREATE POLICY wr ON dealercrm.vehicle_work FOR ALL TO authenticated
  USING (dealercrm.vehicle_visible(vehicle_id) AND (SELECT dealercrm.has_role('admin','used_manager','reconditioning')))
  WITH CHECK (dealercrm.vehicle_visible(vehicle_id) AND (SELECT dealercrm.has_role('admin','used_manager','reconditioning')));
CREATE POLICY sel ON dealercrm.vehicle_condition FOR SELECT TO authenticated USING (dealercrm.vehicle_visible(vehicle_id));
CREATE POLICY wr ON dealercrm.vehicle_condition FOR ALL TO authenticated
  USING (dealercrm.vehicle_visible(vehicle_id) AND (SELECT dealercrm.has_role('admin','used_manager','reconditioning','yard')))
  WITH CHECK (dealercrm.vehicle_visible(vehicle_id) AND (SELECT dealercrm.has_role('admin','used_manager','reconditioning','yard')));
CREATE POLICY sel ON dealercrm.vehicle_damage FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM dealercrm.vehicle_condition c WHERE c.id = condition_id AND dealercrm.vehicle_visible(c.vehicle_id)));
CREATE POLICY wr ON dealercrm.vehicle_damage FOR ALL TO authenticated
  USING ((SELECT dealercrm.has_role('admin','used_manager','reconditioning','yard'))
         AND EXISTS (SELECT 1 FROM dealercrm.vehicle_condition c WHERE c.id = condition_id AND dealercrm.vehicle_visible(c.vehicle_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM dealercrm.vehicle_condition c WHERE c.id = condition_id AND dealercrm.vehicle_visible(c.vehicle_id)));
CREATE POLICY sel ON dealercrm.vehicle_photo FOR SELECT TO authenticated USING (dealercrm.vehicle_visible(vehicle_id));
CREATE POLICY wr ON dealercrm.vehicle_photo FOR ALL TO authenticated
  USING (dealercrm.vehicle_visible(vehicle_id) AND (SELECT dealercrm.has_role('admin','used_manager','reconditioning','yard')))
  WITH CHECK (dealercrm.vehicle_visible(vehicle_id) AND (SELECT dealercrm.has_role('admin','used_manager','reconditioning','yard')));
CREATE POLICY sel ON dealercrm.listing FOR SELECT TO authenticated USING (dealercrm.vehicle_visible(vehicle_id));
CREATE POLICY wr ON dealercrm.listing FOR ALL TO authenticated
  USING (dealercrm.vehicle_visible(vehicle_id) AND (SELECT dealercrm.has_role('admin','used_manager','marketing')))
  WITH CHECK (dealercrm.vehicle_visible(vehicle_id) AND (SELECT dealercrm.has_role('admin','used_manager','marketing')));

CREATE POLICY sel ON dealercrm.customer FOR SELECT TO authenticated
  USING (dealership_id = (SELECT dealercrm.my_dealership())
         AND (SELECT dealercrm.has_role('admin','owner','sales_manager','salesperson','used_manager','accounting','finance_insurance')));
CREATE POLICY wr ON dealercrm.customer FOR ALL TO authenticated
  USING (dealership_id = (SELECT dealercrm.my_dealership()) AND (SELECT dealercrm.has_role('admin','sales_manager','salesperson','accounting','finance_insurance')))
  WITH CHECK (dealership_id = (SELECT dealercrm.my_dealership()) AND (SELECT dealercrm.has_role('admin','sales_manager','salesperson','accounting','finance_insurance')));

-- lead: il venditore vede e modifica solo le sue; lo stato cambia solo con change_lead_status
CREATE POLICY sel ON dealercrm.lead FOR SELECT TO authenticated
  USING (dealership_id = (SELECT dealercrm.my_dealership())
         AND (SELECT dealercrm.has_role('admin','owner','sales_manager','salesperson','used_manager','accounting','finance_insurance','marketing'))
         AND (assigned_to = (SELECT auth.uid()) OR NOT (SELECT dealercrm.has_role('salesperson'))));
CREATE POLICY ins ON dealercrm.lead FOR INSERT TO authenticated
  WITH CHECK (dealership_id = (SELECT dealercrm.my_dealership())
              AND ((SELECT dealercrm.has_role('admin','sales_manager','used_manager'))
                   OR ((SELECT dealercrm.has_role('salesperson')) AND assigned_to = (SELECT auth.uid()))));
CREATE POLICY upd ON dealercrm.lead FOR UPDATE TO authenticated
  USING (dealership_id = (SELECT dealercrm.my_dealership())
         AND ((SELECT dealercrm.has_role('admin','sales_manager')) OR ((SELECT dealercrm.has_role('salesperson')) AND assigned_to = (SELECT auth.uid()))))
  WITH CHECK (dealership_id = (SELECT dealercrm.my_dealership())
              AND ((SELECT dealercrm.has_role('admin','sales_manager')) OR assigned_to = (SELECT auth.uid())));
CREATE POLICY sel ON dealercrm.lead_event FOR SELECT TO authenticated USING (dealercrm.lead_visible(lead_id));
CREATE POLICY sel ON dealercrm.conversation FOR SELECT TO authenticated USING (dealercrm.lead_visible(lead_id));
CREATE POLICY ins ON dealercrm.conversation FOR INSERT TO authenticated
  WITH CHECK (dealercrm.lead_visible(lead_id) AND (SELECT dealercrm.has_role('admin','sales_manager','salesperson')));
CREATE POLICY sel ON dealercrm.appointment FOR SELECT TO authenticated USING (dealercrm.lead_visible(lead_id));
CREATE POLICY wr ON dealercrm.appointment FOR ALL TO authenticated
  USING (dealercrm.lead_visible(lead_id) AND (SELECT dealercrm.has_role('admin','sales_manager','salesperson')))
  WITH CHECK (dealercrm.lead_visible(lead_id) AND (SELECT dealercrm.has_role('admin','sales_manager','salesperson')));

-- pratiche: il venditore solo le sue; lo stato cambia solo con set_deal_status
CREATE POLICY sel ON dealercrm.deal FOR SELECT TO authenticated USING (dealercrm.deal_visible(id));
CREATE POLICY ins ON dealercrm.deal FOR INSERT TO authenticated
  WITH CHECK (dealership_id = (SELECT dealercrm.my_dealership())
              AND ((SELECT dealercrm.has_role('admin','sales_manager','accounting','finance_insurance'))
                   OR ((SELECT dealercrm.has_role('salesperson')) AND salesperson_id = (SELECT auth.uid()))));
CREATE POLICY upd ON dealercrm.deal FOR UPDATE TO authenticated
  USING (dealership_id = (SELECT dealercrm.my_dealership())
         AND ((SELECT dealercrm.has_role('admin','sales_manager','accounting','finance_insurance'))
              OR ((SELECT dealercrm.has_role('salesperson')) AND salesperson_id = (SELECT auth.uid()))))
  WITH CHECK (dealership_id = (SELECT dealercrm.my_dealership())
              AND ((SELECT dealercrm.has_role('admin','sales_manager','accounting','finance_insurance')) OR salesperson_id = (SELECT auth.uid())));
CREATE POLICY sel ON dealercrm.deal_item FOR SELECT TO authenticated
  USING (dealercrm.deal_visible(deal_id) AND (SELECT dealercrm.has_role('admin','owner','sales_manager','used_manager','accounting','finance_insurance')));
CREATE POLICY wr ON dealercrm.deal_item FOR ALL TO authenticated
  USING (dealercrm.deal_visible(deal_id) AND (SELECT dealercrm.has_role('admin','sales_manager','accounting','finance_insurance')))
  WITH CHECK (dealercrm.deal_visible(deal_id) AND (SELECT dealercrm.has_role('admin','sales_manager','accounting','finance_insurance')));
CREATE POLICY sel ON dealercrm.contract FOR SELECT TO authenticated USING (dealercrm.deal_visible(deal_id));
CREATE POLICY sel ON dealercrm.invoice FOR SELECT TO authenticated
  USING (dealercrm.deal_visible(deal_id) AND (SELECT dealercrm.has_role('admin','owner','sales_manager','used_manager','accounting','finance_insurance')));

CREATE POLICY wr ON dealercrm.import_job FOR ALL TO authenticated
  USING (dealership_id = (SELECT dealercrm.my_dealership()) AND (SELECT dealercrm.has_role('admin','used_manager')))
  WITH CHECK (dealership_id = (SELECT dealercrm.my_dealership()) AND (SELECT dealercrm.has_role('admin','used_manager')));
CREATE POLICY wr ON dealercrm.import_row FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM dealercrm.import_job j WHERE j.id = job_id AND j.dealership_id = (SELECT dealercrm.my_dealership()))
         AND (SELECT dealercrm.has_role('admin','used_manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM dealercrm.import_job j WHERE j.id = job_id AND j.dealership_id = (SELECT dealercrm.my_dealership()))
              AND (SELECT dealercrm.has_role('admin','used_manager')));

CREATE POLICY sel ON dealercrm.outbox FOR SELECT TO authenticated
  USING (dealership_id = (SELECT dealercrm.my_dealership()) AND (SELECT dealercrm.has_role('admin','marketing')));
CREATE POLICY sel ON dealercrm.notification FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY upd ON dealercrm.notification FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY sel ON dealercrm.message_template FOR SELECT TO authenticated USING (dealership_id = (SELECT dealercrm.my_dealership()));
CREATE POLICY wr ON dealercrm.message_template FOR ALL TO authenticated
  USING (dealership_id = (SELECT dealercrm.my_dealership()) AND (SELECT dealercrm.has_role('admin','sales_manager','marketing')))
  WITH CHECK (dealership_id = (SELECT dealercrm.my_dealership()) AND (SELECT dealercrm.has_role('admin','sales_manager','marketing')));
-- fic_connection e fic_webhook_event: RLS attiva e nessuna policy (solo service_role)

-- ===================================================================== permessi
REVOKE ALL ON ALL TABLES IN SCHEMA dealercrm FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA dealercrm TO authenticated;
REVOKE ALL ON dealercrm.fic_connection, dealercrm.fic_webhook_event FROM authenticated;
-- le viste sono di sola lettura (una vista semplice sarebbe aggiornabile scavalcando la RLS)
REVOKE INSERT, UPDATE, DELETE ON dealercrm.vehicle_public, dealercrm.vehicle_stock, dealercrm.deal_margin,
  dealercrm.lead_open, dealercrm.salesperson_stats, dealercrm.fic_connection_status FROM authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA dealercrm TO service_role;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA dealercrm FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA dealercrm TO service_role;
-- usate dalle policy e dalle viste
GRANT EXECUTE ON FUNCTION dealercrm.device_ok(), dealercrm.my_role(), dealercrm.my_dealership(), dealercrm.has_role(dealercrm.app_role[]),
  dealercrm.vehicle_visible(uuid), dealercrm.lead_visible(uuid), dealercrm.deal_visible(uuid), dealercrm.can_write_setting_key(text)
  TO authenticated;
-- chiamabili dall'app (controllano il ruolo al loro interno)
GRANT EXECUTE ON FUNCTION
  dealercrm.register_device(text, text),
  dealercrm.change_lead_status(uuid, dealercrm.lead_status, jsonb),
  dealercrm.assign_lead(uuid, uuid, text),
  dealercrm.change_vehicle_status(uuid, dealercrm.vehicle_status, jsonb),
  dealercrm.set_vehicle_yard_position(uuid, uuid, dealercrm.yard_status),
  dealercrm.yard_slot_nearest(double precision, double precision, double precision),
  dealercrm.compare_conditions(uuid, dealercrm.condition_phase, dealercrm.condition_phase),
  dealercrm.set_deal_status(uuid, dealercrm.deal_status),
  dealercrm.on_deal_signed(uuid),
  dealercrm.request_invoice(uuid, dealercrm.invoice_kind)
  TO authenticated;

-- ===================================================================== concessionario e parametri
INSERT INTO dealercrm.dealership (id, name, timezone) VALUES ('10000000-0000-4000-8000-000000000001', 'Concessionario', 'Europe/Rome');
INSERT INTO dealercrm.setting (dealership_id, key, value) VALUES
('10000000-0000-4000-8000-000000000001', 'lead_timers', '{"work_hours":{"mon-fri":["09:00","19:00"],"sat":["09:00","13:00"],"holidays":[]},"timers_min":{"new":2,"qualified":5,"assigned":15,"contacted":2880,"visited":1440,"proposal_sent":4320,"negotiating":10080},"escalation_assigned_min":{"warn_salesperson":15,"warn_manager":30,"reassign":60},"max_reassignments":3,"auto_lose_days":30}'),
('10000000-0000-4000-8000-000000000001', 'value_bands', '{"A":{"max":10000},"B":{"min":10000,"max":20000},"C":{"min":20000,"max":35000},"D":{"min":35000}}'),
('10000000-0000-4000-8000-000000000001', 'assignment_weights', '{"performance":0.40,"rotation":0.40,"load":0.20}'),
('10000000-0000-4000-8000-000000000001', 'assignment_params', '{"max_open_leads":15,"min_share":0.08,"max_hot_share":0.25,"band_c_above_median":true,"band_d_top_n":3}'),
('10000000-0000-4000-8000-000000000001', 'ai_switches', '{"voice":true,"whatsapp":true,"social":false,"mode":"always","out_of_hours_reply":true}'),
('10000000-0000-4000-8000-000000000001', 'ai_handoff', '{"on_customer_request":true,"after_unanswered_questions":3,"price_bands":["D"]}'),
('10000000-0000-4000-8000-000000000001', 'vehicle_alerts', '{"incoming_past_eta":true,"received_intake_hours":24,"reconditioning_days":10,"ready_publish_days":2,"published_warn_days":60,"published_markdown_days":90,"reserved_days":10,"delivering_days":7,"withdrawn_days":30}'),
('10000000-0000-4000-8000-000000000001', 'portal_rules', '{"on_reserved":"suspend"}'),
('10000000-0000-4000-8000-000000000001', 'maps', '{"provider":"google","map_id":null,"map_type":"satellite","default_zoom":19,"tilt":0,"snap_radius_m":15,"stale_position_days":7,"geolocation":"browser"}'),
('10000000-0000-4000-8000-000000000001', 'fatture_in_cloud', '{"enabled":false,"dry_run":true,"company_id":null,"numeration":"/A","e_invoice":true,"vat_kind":"I","vat_id_standard":null,"vat_id_margin":null,"payment_method_id":null,"payment_account_id":null,"ei_payment_method":"MP05","invoice_on":"delivered","item_vat":{"vehicle":"margin","gps":"standard","cvt":"standard","etching":"standard","extended_warranty":"standard","fees":"standard"}}');

-- ===================================================================== storage (bucket privati con prefisso)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('dealercrm-photos', 'dealercrm-photos', false, 10485760, ARRAY['image/jpeg','image/png','image/webp']),
  ('dealercrm-documents', 'dealercrm-documents', false, 20971520, ARRAY['application/pdf','text/html','image/jpeg','image/png']),
  ('dealercrm-imports', 'dealercrm-imports', false, 20971520, ARRAY['text/csv','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
  ('dealercrm-audio', 'dealercrm-audio', false, 20971520, ARRAY['audio/mpeg','audio/wav','audio/webm'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY dealercrm_photos_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'dealercrm-photos' AND dealercrm.my_role() IS NOT NULL);
CREATE POLICY dealercrm_photos_write ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'dealercrm-photos' AND dealercrm.has_role('admin','used_manager','reconditioning','yard'))
  WITH CHECK (bucket_id = 'dealercrm-photos' AND dealercrm.has_role('admin','used_manager','reconditioning','yard'));
CREATE POLICY dealercrm_documents_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'dealercrm-documents' AND dealercrm.has_role('admin','owner','sales_manager','salesperson','used_manager','accounting','finance_insurance'));
CREATE POLICY dealercrm_imports_all ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'dealercrm-imports' AND dealercrm.has_role('admin','used_manager'))
  WITH CHECK (bucket_id = 'dealercrm-imports' AND dealercrm.has_role('admin','used_manager'));
CREATE POLICY dealercrm_audio_all ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'dealercrm-audio' AND dealercrm.has_role('admin','sales_manager'))
  WITH CHECK (bucket_id = 'dealercrm-audio' AND dealercrm.has_role('admin','sales_manager'));

-- ===================================================================== realtime, cron, API
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE dealercrm.vehicle;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname LIKE 'etidealcrm-%' OR jobname LIKE 'dealercrm-%';
    PERFORM cron.schedule('dealercrm-lead-timers', '* * * * *', 'SELECT dealercrm.process_lead_timers()');
    PERFORM cron.schedule('dealercrm-outbox', '* * * * *', 'SELECT dealercrm.process_outbox()');
  END IF;
END $$;

-- schemi esposti dall'API: si sostituisce etidealcrm con dealercrm, gli altri restano
ALTER ROLE authenticator SET pgrst.db_schemas = 'public, etideal, dealercrm';
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
