SET search_path = etidealcrm, public, extensions;

-- ===== Google Maps: centro del concessionario e stalli con coordinate =====
ALTER TABLE etidealcrm.dealership
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision;

-- Stallo più vicino a un punto, entro un raggio (metri). Serve al tocco sulla mappa.
CREATE OR REPLACE FUNCTION etidealcrm.yard_slot_nearest(_lat double precision, _lng double precision, _radius_m double precision DEFAULT 15)
RETURNS TABLE (slot_id uuid, code text, zone_code text, distance_m double precision)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = etidealcrm AS $$
  SELECT s.id, s.code, z.code,
         2 * 6371000 * asin(sqrt(
           power(sin(radians(s.lat - _lat) / 2), 2) +
           cos(radians(_lat)) * cos(radians(s.lat)) * power(sin(radians(s.lng - _lng) / 2), 2)
         )) AS distance_m
  FROM etidealcrm.yard_slot s JOIN etidealcrm.yard_zone z ON z.id = s.zone_id
  WHERE s.lat IS NOT NULL AND s.lng IS NOT NULL
    AND z.dealership_id = etidealcrm.current_dealership_id()
  ORDER BY distance_m
  LIMIT 1
$$;
-- Filtro sul raggio applicato lato chiamante: se distance_m > _radius_m si propone di creare uno stallo nuovo.

GRANT EXECUTE ON FUNCTION etidealcrm.yard_slot_nearest(double precision, double precision, double precision) TO authenticated;

INSERT INTO etidealcrm.setting (dealership_id, key, value)
SELECT d.id, 'maps', jsonb_build_object(
  'provider', 'google',
  'map_id', null,               -- Map ID da Cloud Console (serve per gli Advanced Markers)
  'map_type', 'satellite',
  'default_zoom', 19,
  'tilt', 0,
  'snap_radius_m', 15,
  'stale_position_days', 7,
  'geolocation', 'browser'      -- navigator.geolocation del telefono; l'API Geolocation di Google non serve
) FROM etidealcrm.dealership d
ON CONFLICT (dealership_id, key) DO NOTHING;

-- ===== Fatture in Cloud =====
-- Collegamento OAuth: una riga per concessionario. Solo service_role: nessun GRANT a authenticated.
CREATE TABLE IF NOT EXISTS etidealcrm.fic_connection (
  dealership_id uuid PRIMARY KEY REFERENCES etidealcrm.dealership(id) ON DELETE CASCADE,
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
GRANT ALL ON etidealcrm.fic_connection TO service_role;
ALTER TABLE etidealcrm.fic_connection ENABLE ROW LEVEL SECURITY;

-- Stato della connessione leggibile dall'app senza esporre i token.
CREATE OR REPLACE VIEW etidealcrm.fic_connection_status AS
  SELECT dealership_id, company_id, company_name, connected_at, expires_at, last_error,
         (access_token IS NOT NULL) AS connected
  FROM etidealcrm.fic_connection;
GRANT SELECT ON etidealcrm.fic_connection_status TO authenticated;

DO $$ BEGIN
  CREATE TYPE etidealcrm.invoice_kind AS ENUM ('invoice','proforma','credit_note','receipt');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE etidealcrm.invoice_status AS ENUM ('draft','queued','created','sent','paid','error','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS etidealcrm.invoice (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealership_id uuid NOT NULL REFERENCES etidealcrm.dealership(id),
  deal_id uuid REFERENCES etidealcrm.deal(id),
  kind etidealcrm.invoice_kind NOT NULL DEFAULT 'invoice',
  status etidealcrm.invoice_status NOT NULL DEFAULT 'draft',
  fic_document_id bigint,
  number int,
  numeration text,
  date date,
  amount_net numeric(12,2),
  amount_vat numeric(12,2),
  amount_gross numeric(12,2),
  payload jsonb,            -- corpo inviato a Fatture in Cloud (o che verrebbe inviato, in dry run)
  response jsonb,           -- risposta di Fatture in Cloud
  fic_url text,
  pdf_path text,
  dry_run boolean NOT NULL DEFAULT true,
  last_error text,
  requested_by uuid,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (dealership_id, fic_document_id)
);
CREATE INDEX IF NOT EXISTS invoice_deal_idx ON etidealcrm.invoice(deal_id);
GRANT SELECT, INSERT, UPDATE ON etidealcrm.invoice TO authenticated;
GRANT ALL ON etidealcrm.invoice TO service_role;
ALTER TABLE etidealcrm.invoice ENABLE ROW LEVEL SECURITY;
CREATE POLICY invoice_read ON etidealcrm.invoice FOR SELECT TO authenticated
  USING (dealership_id = etidealcrm.current_dealership_id() AND etidealcrm.can_read_deals());
CREATE POLICY invoice_write ON etidealcrm.invoice FOR ALL TO authenticated
  USING (dealership_id = etidealcrm.current_dealership_id() AND etidealcrm.can_write_all_deals())
  WITH CHECK (dealership_id = etidealcrm.current_dealership_id() AND etidealcrm.can_write_all_deals());

-- Eventi ricevuti dai webhook: deduplica su id (CloudEvents id).
CREATE TABLE IF NOT EXISTS etidealcrm.fic_webhook_event (
  id text PRIMARY KEY,
  type text NOT NULL,
  subject text,
  occurred_at timestamptz,
  received_at timestamptz DEFAULT now(),
  payload jsonb,
  processed_at timestamptz,
  error text
);
GRANT ALL ON etidealcrm.fic_webhook_event TO service_role;
ALTER TABLE etidealcrm.fic_webhook_event ENABLE ROW LEVEL SECURITY;

INSERT INTO etidealcrm.setting (dealership_id, key, value)
SELECT d.id, 'fatture_in_cloud', jsonb_build_object(
  'enabled', false,
  'dry_run', true,                 -- finché true la fattura si prepara ma non si invia
  'company_id', null,
  'numeration', '/A',
  'e_invoice', true,
  'vat_kind', 'I',
  'vat_id_standard', null,         -- id IVA 22% da GET /c/{company_id}/info/vat_types
  'vat_id_margin', null,           -- id IVA per il regime del margine (art. 36 D.L. 41/1995, natura N5)
  'payment_method_id', null,       -- da GET /c/{company_id}/info/payment_methods
  'payment_account_id', null,      -- da GET /c/{company_id}/info/payment_accounts
  'ei_payment_method', 'MP05',     -- bonifico
  'invoice_on', 'delivered',       -- quando creare la fattura: signed | delivered
  'item_vat', jsonb_build_object(  -- quale IVA per ogni voce di pratica
      'vehicle', 'margin', 'gps', 'standard', 'cvt', 'standard', 'etching', 'standard',
      'extended_warranty', 'standard', 'fees', 'standard')
) FROM etidealcrm.dealership d
ON CONFLICT (dealership_id, key) DO NOTHING;

-- Corpo della fattura (formato Fatture in Cloud) a partire dalla pratica.
CREATE OR REPLACE FUNCTION etidealcrm.build_invoice_payload(_deal_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = etidealcrm AS $$
DECLARE
  d etidealcrm.deal; c etidealcrm.customer; v etidealcrm.vehicle; cfg jsonb; items jsonb; services jsonb;
  vat_std int; vat_margin int; price numeric; balance numeric;
BEGIN
  SELECT * INTO d FROM etidealcrm.deal WHERE id = _deal_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'deal not found'; END IF;
  SELECT * INTO c FROM etidealcrm.customer WHERE id = d.customer_id;
  SELECT * INTO v FROM etidealcrm.vehicle WHERE id = d.vehicle_id;
  SELECT value INTO cfg FROM etidealcrm.setting WHERE dealership_id = d.dealership_id AND key = 'fatture_in_cloud';
  cfg := coalesce(cfg, '{}'::jsonb);
  vat_std := (cfg ->> 'vat_id_standard')::int;
  vat_margin := (cfg ->> 'vat_id_margin')::int;
  price := coalesce(d.sale_price, 0);

  -- Voce veicolo: prezzo in regime del margine (IVA non esposta), poi i servizi accessori con IVA ordinaria.
  items := jsonb_build_array(jsonb_build_object(
    'name', concat_ws(' ', v.make, v.model, v.trim),
    'description', format('Targa %s, telaio %s, immatricolazione %s, km %s. Veicolo usato, regime del margine art. 36 D.L. 41/1995.',
                           v.plate, coalesce(v.vin,'-'), coalesce(to_char(v.first_registration,'DD/MM/YYYY'),'-'), coalesce(v.mileage_km::text,'-')),
    'qty', 1, 'net_price', price, 'vat', jsonb_build_object('id', vat_margin), 'not_taxable', vat_margin IS NULL));

  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'name', CASE i.type WHEN 'gps' THEN 'Antifurto satellitare' WHEN 'cvt' THEN 'Cristalli (CVT)' WHEN 'etching' THEN 'Marchiatura antifurto'
                          WHEN 'extended_warranty' THEN 'Garanzia estesa' WHEN 'fees' THEN 'Spese di gestione pratica' ELSE i.type::text END,
      'qty', 1, 'net_price', round(coalesce(i.actual, i.estimated, 0) / 1.22, 2), 'vat', jsonb_build_object('id', vat_std))), '[]'::jsonb)
  INTO services
  FROM etidealcrm.deal_item i
  WHERE i.deal_id = _deal_id AND i.kind = 'revenue' AND i.type IN ('gps','cvt','etching','extended_warranty','fees')
    AND coalesce(i.actual, i.estimated, 0) > 0;
  items := items || services;

  balance := price + (SELECT coalesce(sum(coalesce(i.actual, i.estimated, 0)), 0) FROM etidealcrm.deal_item i
                      WHERE i.deal_id = _deal_id AND i.kind = 'revenue' AND i.type IN ('gps','cvt','etching','extended_warranty','fees'))
             - coalesce(d.deposit, 0) - coalesce((d.trade_in ->> 'value')::numeric, 0) - coalesce((d.financing ->> 'amount')::numeric, 0);

  RETURN jsonb_build_object('data', jsonb_strip_nulls(jsonb_build_object(
    'type', 'invoice',
    'entity', jsonb_build_object(
       'name', concat_ws(' ', c.first_name, c.last_name), 'address_city', c.city, 'country', 'Italia',
       'e_invoice', (cfg ->> 'e_invoice')::boolean, 'ei_code', '0000000'),
    'date', to_char(current_date, 'YYYY-MM-DD'),
    'numeration', cfg ->> 'numeration',
    'subject', format('Vendita %s %s targa %s - pratica %s', v.make, v.model, v.plate, _deal_id::text),
    'visible_subject', format('Vendita veicolo %s %s targa %s', v.make, v.model, v.plate),
    'currency', jsonb_build_object('id', 'EUR'),
    'language', jsonb_build_object('code', 'it', 'name', 'Italiano'),
    'e_invoice', (cfg ->> 'e_invoice')::boolean,
    'ei_data', jsonb_build_object('vat_kind', cfg ->> 'vat_kind', 'payment_method', cfg ->> 'ei_payment_method'),
    'items_list', items,
    'payments_list', jsonb_build_array(
       CASE WHEN coalesce(d.deposit,0) > 0 THEN jsonb_build_object('amount', d.deposit, 'due_date', to_char(current_date,'YYYY-MM-DD'), 'status', 'paid',
            'payment_account', jsonb_build_object('id', (cfg ->> 'payment_account_id')::int)) ELSE NULL END,
       jsonb_build_object('amount', greatest(balance, 0), 'due_date', to_char(current_date + 30, 'YYYY-MM-DD'), 'status', 'not_paid')
    ) - 'null',
    'payment_method', jsonb_build_object('id', (cfg ->> 'payment_method_id')::int)
  )), 'options', jsonb_build_object('fix_payments', true));
END $$;
GRANT EXECUTE ON FUNCTION etidealcrm.build_invoice_payload(uuid) TO authenticated;

-- Richiesta fattura: crea la riga e mette in coda l'azione per l'adattatore.
CREATE OR REPLACE FUNCTION etidealcrm.request_invoice(_deal_id uuid, _kind etidealcrm.invoice_kind DEFAULT 'invoice')
RETURNS etidealcrm.invoice LANGUAGE plpgsql SECURITY DEFINER SET search_path = etidealcrm AS $$
DECLARE d etidealcrm.deal; inv etidealcrm.invoice; cfg jsonb;
BEGIN
  SELECT * INTO d FROM etidealcrm.deal WHERE id = _deal_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'deal not found'; END IF;
  SELECT value INTO cfg FROM etidealcrm.setting WHERE dealership_id = d.dealership_id AND key = 'fatture_in_cloud';
  INSERT INTO etidealcrm.invoice (dealership_id, deal_id, kind, status, payload, dry_run, requested_by, is_demo)
  VALUES (d.dealership_id, _deal_id, _kind, 'queued', etidealcrm.build_invoice_payload(_deal_id),
          coalesce((cfg ->> 'dry_run')::boolean, true), auth.uid(), d.is_demo)
  RETURNING * INTO inv;
  INSERT INTO etidealcrm.outbox (dealership_id, integration, action, payload)
  VALUES (d.dealership_id, 'fatture_in_cloud', 'create_invoice', jsonb_build_object('invoice_id', inv.id, 'deal_id', _deal_id));
  RETURN inv;
END $$;
GRANT EXECUTE ON FUNCTION etidealcrm.request_invoice(uuid, etidealcrm.invoice_kind) TO authenticated;
