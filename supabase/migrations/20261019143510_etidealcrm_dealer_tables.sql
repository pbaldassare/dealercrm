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
ALTER TABLE etidealcrm.lead ADD CONSTRAINT lead_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES etidealcrm.deal (id);
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
