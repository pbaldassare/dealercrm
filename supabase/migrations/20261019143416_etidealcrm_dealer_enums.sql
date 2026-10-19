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
CREATE TYPE etidealcrm.fuel_level AS ENUM ('empty', 'quarter', 'half', 'three_quarters', 'full');
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
CREATE TYPE etidealcrm.vehicle_work_kind AS ENUM ('bodywork', 'mechanical', 'cleaning', 'documents');
CREATE TYPE etidealcrm.vehicle_work_status AS ENUM ('planned', 'in_progress', 'done');
CREATE TYPE etidealcrm.purchase_type AS ENUM ('cash', 'financing', 'trade_in');
CREATE TYPE etidealcrm.urgency AS ENUM ('low', 'medium', 'high');
CREATE TYPE etidealcrm.actor_kind AS ENUM ('user', 'system', 'ai');
CREATE TYPE etidealcrm.message_direction AS ENUM ('in', 'out');
CREATE TYPE etidealcrm.deal_item_kind AS ENUM ('revenue', 'cost');
CREATE TYPE etidealcrm.conclusion_type AS ENUM ('on_premises', 'distance', 'off_premises');
CREATE TYPE etidealcrm.import_kind AS ENUM ('vehicles', 'leads', 'customers', 'suppliers');
CREATE TYPE etidealcrm.import_job_status AS ENUM ('pending', 'preview', 'importing', 'done', 'failed');
CREATE TYPE etidealcrm.import_row_status AS ENUM ('pending', 'valid', 'skipped', 'duplicate', 'error');
CREATE TYPE etidealcrm.lost_reason AS ENUM (
  'price_too_high', 'vehicle_sold', 'chose_competitor', 'no_response',
  'financing_denied', 'trade_in_not_accepted', 'changed_mind', 'other'
);
