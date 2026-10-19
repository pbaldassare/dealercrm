DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['dealership','profile','device','setting','setting_history','supplier','yard_zone','yard_slot','vehicle','vehicle_event','vehicle_work','vehicle_condition','vehicle_damage','vehicle_photo','listing','customer','lead','lead_event','conversation','appointment','deal','deal_item','contract','import_job','import_row','outbox','notification','message_template'] LOOP EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON etidealcrm.%I TO authenticated, service_role', t); EXECUTE format('REVOKE ALL ON etidealcrm.%I FROM anon, PUBLIC', t); END LOOP; END $$;
GRANT SELECT ON etidealcrm.vehicle_stock TO authenticated, service_role;
GRANT SELECT ON etidealcrm.vehicle_public TO authenticated, service_role;
GRANT SELECT ON etidealcrm.deal_margin TO authenticated, service_role;
GRANT SELECT ON etidealcrm.lead_open TO authenticated, service_role;
REVOKE ALL ON etidealcrm.vehicle_stock FROM anon, PUBLIC;
REVOKE ALL ON etidealcrm.vehicle_public FROM anon, PUBLIC;
REVOKE ALL ON etidealcrm.deal_margin FROM anon, PUBLIC;
REVOKE ALL ON etidealcrm.lead_open FROM anon, PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA etidealcrm GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;
INSERT INTO etidealcrm.dealership (id, name, timezone) VALUES ('10000000-0000-4000-8000-000000000001', 'EtiDeal Concessionario', 'Europe/Rome');
INSERT INTO etidealcrm.setting (dealership_id, key, value) VALUES
('10000000-0000-4000-8000-000000000001','lead_timers','{"work_hours":{"mon-fri":["09:00","19:00"],"sat":["09:00","13:00"],"holidays":[]},"timers_min":{"new":2,"qualified":5,"assigned":15,"contacted":2880,"visited":1440,"proposal_sent":4320,"negotiating":10080},"escalation_assigned_min":{"warn_salesperson":15,"warn_manager":30,"reassign":60},"max_reassignments":3,"auto_lose_days":30}'::jsonb),
('10000000-0000-4000-8000-000000000001','value_bands','{"A":{"max":10000},"B":{"min":10000,"max":20000},"C":{"min":20000,"max":35000},"D":{"min":35000}}'::jsonb),
('10000000-0000-4000-8000-000000000001','assignment_weights','{"performance":0.40,"rotation":0.40,"load":0.20}'::jsonb),
('10000000-0000-4000-8000-000000000001','assignment_params','{"max_open_leads":15,"min_share":0.08,"max_hot_share":0.25,"band_c_above_median":true,"band_d_top_n":3}'::jsonb),
('10000000-0000-4000-8000-000000000001','ai_switches','{"voice":true,"whatsapp":true,"social":false,"mode":"always","out_of_hours_reply":true}'::jsonb),
('10000000-0000-4000-8000-000000000001','ai_handoff','{"on_customer_request":true,"after_unanswered_questions":3,"price_bands":["D"]}'::jsonb),
('10000000-0000-4000-8000-000000000001','vehicle_alerts','{"incoming_past_eta":true,"received_intake_hours":24,"reconditioning_days":10,"ready_publish_days":2,"published_warn_days":60,"published_markdown_days":90,"reserved_days":10,"delivering_days":7,"withdrawn_days":30}'::jsonb),
('10000000-0000-4000-8000-000000000001','portal_rules','{"on_reserved":"suspend"}'::jsonb);
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE etidealcrm.vehicle; EXCEPTION WHEN duplicate_object THEN NULL; END; END IF; END $$;
NOTIFY pgrst, 'reload schema';
