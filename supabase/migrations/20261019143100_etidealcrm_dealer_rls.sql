-- RLS, grants, and seed for etidealcrm dealer model.
-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'dealership','profile','device','setting','setting_history','supplier',
    'yard_zone','yard_slot','vehicle','vehicle_event','vehicle_work',
    'vehicle_condition','vehicle_damage','vehicle_photo','listing',
    'customer','lead','lead_event','conversation','appointment',
    'deal','deal_item','contract','import_job','import_row','outbox',
    'notification','message_template'
  ]
  LOOP
    EXECUTE format('ALTER TABLE etidealcrm.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- dealership
CREATE POLICY dealership_select ON etidealcrm.dealership
  FOR SELECT TO authenticated
  USING ((SELECT etidealcrm.is_active_user()) AND id = (SELECT etidealcrm.current_dealership_id()));
CREATE POLICY dealership_update ON etidealcrm.dealership
  FOR UPDATE TO authenticated
  USING ((SELECT etidealcrm.can_manage_users()) AND id = (SELECT etidealcrm.current_dealership_id()))
  WITH CHECK (id = (SELECT etidealcrm.current_dealership_id()));

-- profile
CREATE POLICY profile_select ON etidealcrm.profile
  FOR SELECT TO authenticated
  USING (
    (SELECT etidealcrm.is_active_user())
    AND dealership_id = (SELECT etidealcrm.current_dealership_id())
  );
CREATE POLICY profile_insert ON etidealcrm.profile
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT etidealcrm.can_manage_users()));
CREATE POLICY profile_update ON etidealcrm.profile
  FOR UPDATE TO authenticated
  USING (
    (SELECT etidealcrm.is_active_user())
    AND (
      (SELECT etidealcrm.can_manage_users())
      OR id = (SELECT auth.uid())
    )
  )
  WITH CHECK (dealership_id = (SELECT etidealcrm.current_dealership_id()));

-- device
CREATE POLICY device_select ON etidealcrm.device
  FOR SELECT TO authenticated
  USING (
    (SELECT etidealcrm.is_active_user())
    AND (
      (SELECT etidealcrm.can_manage_users())
      OR user_id = (SELECT auth.uid())
    )
  );
CREATE POLICY device_insert ON etidealcrm.device
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT etidealcrm.is_active_user())
    AND user_id = (SELECT auth.uid())
    AND status = 'pending'
  );
CREATE POLICY device_update ON etidealcrm.device
  FOR UPDATE TO authenticated
  USING ((SELECT etidealcrm.can_manage_users()) OR user_id = (SELECT auth.uid()))
  WITH CHECK (true);

-- setting
CREATE POLICY setting_select ON etidealcrm.setting
  FOR SELECT TO authenticated
  USING (
    (SELECT etidealcrm.is_active_user())
    AND dealership_id = (SELECT etidealcrm.current_dealership_id())
  );
CREATE POLICY setting_write ON etidealcrm.setting
  FOR ALL TO authenticated
  USING (
    dealership_id = (SELECT etidealcrm.current_dealership_id())
    AND (SELECT etidealcrm.can_write_setting_key(key))
  )
  WITH CHECK (
    dealership_id = (SELECT etidealcrm.current_dealership_id())
    AND (SELECT etidealcrm.can_write_setting_key(key))
  );

CREATE POLICY setting_history_select ON etidealcrm.setting_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM etidealcrm.setting s
      WHERE s.id = setting_id
        AND s.dealership_id = (SELECT etidealcrm.current_dealership_id())
    )
    AND (SELECT etidealcrm.is_active_user())
  );

-- supplier
CREATE POLICY supplier_select ON etidealcrm.supplier
  FOR SELECT TO authenticated
  USING (
    dealership_id = (SELECT etidealcrm.current_dealership_id())
    AND (SELECT etidealcrm.can_read_suppliers())
  );
CREATE POLICY supplier_write ON etidealcrm.supplier
  FOR ALL TO authenticated
  USING (
    dealership_id = (SELECT etidealcrm.current_dealership_id())
    AND (SELECT etidealcrm.can_write_suppliers())
  )
  WITH CHECK (
    dealership_id = (SELECT etidealcrm.current_dealership_id())
    AND (SELECT etidealcrm.can_write_suppliers())
  );

-- yard
CREATE POLICY yard_zone_select ON etidealcrm.yard_zone
  FOR SELECT TO authenticated
  USING (
    dealership_id = (SELECT etidealcrm.current_dealership_id())
    AND (SELECT etidealcrm.can_read_yard())
  );
CREATE POLICY yard_zone_write ON etidealcrm.yard_zone
  FOR ALL TO authenticated
  USING (
    dealership_id = (SELECT etidealcrm.current_dealership_id())
    AND (SELECT etidealcrm.can_write_yard())
  )
  WITH CHECK (
    dealership_id = (SELECT etidealcrm.current_dealership_id())
    AND (SELECT etidealcrm.can_write_yard())
  );

CREATE POLICY yard_slot_select ON etidealcrm.yard_slot
  FOR SELECT TO authenticated
  USING (
    (SELECT etidealcrm.can_read_yard())
    AND EXISTS (
      SELECT 1 FROM etidealcrm.yard_zone z
      WHERE z.id = zone_id AND z.dealership_id = (SELECT etidealcrm.current_dealership_id())
    )
  );
CREATE POLICY yard_slot_write ON etidealcrm.yard_slot
  FOR ALL TO authenticated
  USING (
    (SELECT etidealcrm.can_write_yard())
    AND EXISTS (
      SELECT 1 FROM etidealcrm.yard_zone z
      WHERE z.id = zone_id AND z.dealership_id = (SELECT etidealcrm.current_dealership_id())
    )
  )
  WITH CHECK (
    (SELECT etidealcrm.can_write_yard())
  );

-- vehicle: cost-visible roles only (others use vehicle_public)
CREATE POLICY vehicle_select ON etidealcrm.vehicle
  FOR SELECT TO authenticated
  USING (
    dealership_id = (SELECT etidealcrm.current_dealership_id())
    AND (SELECT etidealcrm.can_read_costs())
  );
CREATE POLICY vehicle_insert ON etidealcrm.vehicle
  FOR INSERT TO authenticated
  WITH CHECK (
    dealership_id = (SELECT etidealcrm.current_dealership_id())
    AND (SELECT etidealcrm.can_write_vehicles())
  );
CREATE POLICY vehicle_update ON etidealcrm.vehicle
  FOR UPDATE TO authenticated
  USING (
    dealership_id = (SELECT etidealcrm.current_dealership_id())
    AND (SELECT etidealcrm.can_write_vehicles())
  )
  WITH CHECK (dealership_id = (SELECT etidealcrm.current_dealership_id()));
CREATE POLICY vehicle_delete ON etidealcrm.vehicle
  FOR DELETE TO authenticated
  USING (
    dealership_id = (SELECT etidealcrm.current_dealership_id())
    AND (SELECT etidealcrm.can_write_vehicles())
  );

CREATE POLICY vehicle_event_select ON etidealcrm.vehicle_event
  FOR SELECT TO authenticated
  USING (
    (SELECT etidealcrm.can_read_vehicles())
    AND (SELECT etidealcrm.vehicle_in_current_dealership(vehicle_id))
  );
CREATE POLICY vehicle_event_insert ON etidealcrm.vehicle_event
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT etidealcrm.can_read_vehicles()));

CREATE POLICY vehicle_work_select ON etidealcrm.vehicle_work
  FOR SELECT TO authenticated
  USING (
    (SELECT etidealcrm.can_read_vehicles())
    AND (
      (SELECT etidealcrm.can_read_costs())
      OR cost IS NULL
    )
    AND (SELECT etidealcrm.vehicle_in_current_dealership(vehicle_id))
  );
CREATE POLICY vehicle_work_insert ON etidealcrm.vehicle_work
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT etidealcrm.can_write_work()));
CREATE POLICY vehicle_work_update ON etidealcrm.vehicle_work
  FOR UPDATE TO authenticated
  USING ((SELECT etidealcrm.can_write_work()))
  WITH CHECK ((SELECT etidealcrm.can_write_work()));
CREATE POLICY vehicle_work_delete ON etidealcrm.vehicle_work
  FOR DELETE TO authenticated
  USING ((SELECT etidealcrm.can_write_work()));

CREATE POLICY vehicle_condition_select ON etidealcrm.vehicle_condition
  FOR SELECT TO authenticated
  USING (
    (SELECT etidealcrm.can_read_vehicles())
    AND (SELECT etidealcrm.vehicle_in_current_dealership(vehicle_id))
  );
CREATE POLICY vehicle_condition_insert ON etidealcrm.vehicle_condition
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT etidealcrm.can_write_conditions()));
CREATE POLICY vehicle_condition_update ON etidealcrm.vehicle_condition
  FOR UPDATE TO authenticated
  USING ((SELECT etidealcrm.can_write_conditions()))
  WITH CHECK ((SELECT etidealcrm.can_write_conditions()));

CREATE POLICY vehicle_damage_select ON etidealcrm.vehicle_damage
  FOR SELECT TO authenticated
  USING ((SELECT etidealcrm.can_read_vehicles()));
CREATE POLICY vehicle_damage_write ON etidealcrm.vehicle_damage
  FOR ALL TO authenticated
  USING ((SELECT etidealcrm.can_write_conditions()))
  WITH CHECK ((SELECT etidealcrm.can_write_conditions()));

CREATE POLICY vehicle_photo_select ON etidealcrm.vehicle_photo
  FOR SELECT TO authenticated
  USING ((SELECT etidealcrm.can_read_vehicles()));
CREATE POLICY vehicle_photo_write ON etidealcrm.vehicle_photo
  FOR ALL TO authenticated
  USING ((SELECT etidealcrm.can_write_conditions()) OR (SELECT etidealcrm.can_write_vehicles()))
  WITH CHECK (true);

CREATE POLICY listing_select ON etidealcrm.listing
  FOR SELECT TO authenticated
  USING ((SELECT etidealcrm.can_read_vehicles()));
CREATE POLICY listing_write ON etidealcrm.listing
  FOR ALL TO authenticated
  USING ((SELECT etidealcrm.can_write_listings()))
  WITH CHECK ((SELECT etidealcrm.can_write_listings()));

-- customer / lead
CREATE POLICY customer_select ON etidealcrm.customer
  FOR SELECT TO authenticated
  USING (
    dealership_id = (SELECT etidealcrm.current_dealership_id())
    AND (SELECT etidealcrm.can_read_leads() OR etidealcrm.can_read_deals())
  );
CREATE POLICY customer_write ON etidealcrm.customer
  FOR ALL TO authenticated
  USING (
    dealership_id = (SELECT etidealcrm.current_dealership_id())
    AND (SELECT etidealcrm.can_write_all_leads() OR etidealcrm.has_role('salesperson','accounting'))
  )
  WITH CHECK (dealership_id = (SELECT etidealcrm.current_dealership_id()));

CREATE POLICY lead_select ON etidealcrm.lead
  FOR SELECT TO authenticated
  USING (
    dealership_id = (SELECT etidealcrm.current_dealership_id())
    AND (SELECT etidealcrm.can_read_leads())
    AND (
      (SELECT NOT etidealcrm.has_role('salesperson'))
      OR assigned_to = (SELECT auth.uid())
      OR assigned_to IS NULL
    )
  );
CREATE POLICY lead_insert ON etidealcrm.lead
  FOR INSERT TO authenticated
  WITH CHECK (
    dealership_id = (SELECT etidealcrm.current_dealership_id())
    AND (
      (SELECT etidealcrm.can_write_all_leads())
      OR (SELECT etidealcrm.has_role('salesperson'))
    )
  );
CREATE POLICY lead_update ON etidealcrm.lead
  FOR UPDATE TO authenticated
  USING (
    dealership_id = (SELECT etidealcrm.current_dealership_id())
    AND (
      (SELECT etidealcrm.can_write_all_leads())
      OR (assigned_to = (SELECT auth.uid()) AND (SELECT etidealcrm.has_role('salesperson')))
    )
  )
  WITH CHECK (dealership_id = (SELECT etidealcrm.current_dealership_id()));

CREATE POLICY lead_event_select ON etidealcrm.lead_event
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM etidealcrm.lead l
      WHERE l.id = lead_id
        AND l.dealership_id = (SELECT etidealcrm.current_dealership_id())
    )
    AND (SELECT etidealcrm.can_read_leads())
  );
CREATE POLICY lead_event_insert ON etidealcrm.lead_event
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT etidealcrm.can_read_leads()));

CREATE POLICY conversation_select ON etidealcrm.conversation
  FOR SELECT TO authenticated
  USING ((SELECT etidealcrm.can_read_leads()));
CREATE POLICY conversation_write ON etidealcrm.conversation
  FOR ALL TO authenticated
  USING (
    (SELECT etidealcrm.can_write_all_leads())
    OR (SELECT etidealcrm.has_role('salesperson'))
  )
  WITH CHECK (true);

CREATE POLICY appointment_select ON etidealcrm.appointment
  FOR SELECT TO authenticated
  USING (
    (SELECT etidealcrm.can_read_leads())
    AND (
      (SELECT NOT etidealcrm.has_role('salesperson'))
      OR salesperson_id = (SELECT auth.uid())
    )
  );
CREATE POLICY appointment_write ON etidealcrm.appointment
  FOR ALL TO authenticated
  USING (
    (SELECT etidealcrm.can_write_all_leads())
    OR salesperson_id = (SELECT auth.uid())
  )
  WITH CHECK (true);

-- deals
CREATE POLICY deal_select ON etidealcrm.deal
  FOR SELECT TO authenticated
  USING (
    dealership_id = (SELECT etidealcrm.current_dealership_id())
    AND (SELECT etidealcrm.can_read_deals())
    AND (
      (SELECT NOT etidealcrm.has_role('salesperson'))
      OR salesperson_id = (SELECT auth.uid())
    )
  );
CREATE POLICY deal_write ON etidealcrm.deal
  FOR ALL TO authenticated
  USING (
    dealership_id = (SELECT etidealcrm.current_dealership_id())
    AND (
      (SELECT etidealcrm.can_write_all_deals())
      OR (salesperson_id = (SELECT auth.uid()) AND (SELECT etidealcrm.has_role('salesperson')))
    )
  )
  WITH CHECK (dealership_id = (SELECT etidealcrm.current_dealership_id()));

CREATE POLICY deal_item_select ON etidealcrm.deal_item
  FOR SELECT TO authenticated
  USING ((SELECT etidealcrm.can_read_costs()));
CREATE POLICY deal_item_write ON etidealcrm.deal_item
  FOR ALL TO authenticated
  USING (
    (SELECT etidealcrm.can_write_all_deals())
    OR (SELECT etidealcrm.has_role('salesperson') AND type IN (
      'discount', 'other_cost'
    ))
  )
  WITH CHECK (true);

CREATE POLICY contract_select ON etidealcrm.contract
  FOR SELECT TO authenticated
  USING ((SELECT etidealcrm.can_read_deals()));
CREATE POLICY contract_write ON etidealcrm.contract
  FOR ALL TO authenticated
  USING ((SELECT etidealcrm.can_write_all_deals()) OR (SELECT etidealcrm.has_role('salesperson')))
  WITH CHECK (true);

CREATE POLICY import_job_all ON etidealcrm.import_job
  FOR ALL TO authenticated
  USING (
    dealership_id = (SELECT etidealcrm.current_dealership_id())
    AND (SELECT etidealcrm.has_role('admin','used_manager'))
  )
  WITH CHECK (
    dealership_id = (SELECT etidealcrm.current_dealership_id())
    AND (SELECT etidealcrm.has_role('admin','used_manager'))
  );
CREATE POLICY import_row_all ON etidealcrm.import_row
  FOR ALL TO authenticated
  USING ((SELECT etidealcrm.has_role('admin','used_manager')))
  WITH CHECK ((SELECT etidealcrm.has_role('admin','used_manager')));

CREATE POLICY outbox_select ON etidealcrm.outbox
  FOR SELECT TO authenticated
  USING (
    (SELECT etidealcrm.has_role('admin','marketing'))
    AND (dealership_id = (SELECT etidealcrm.current_dealership_id()) OR dealership_id IS NULL)
  );

CREATE POLICY notification_select ON etidealcrm.notification
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY notification_update ON etidealcrm.notification
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY message_template_select ON etidealcrm.message_template
  FOR SELECT TO authenticated
  USING (
    dealership_id = (SELECT etidealcrm.current_dealership_id())
    AND (SELECT etidealcrm.is_active_user())
  );
CREATE POLICY message_template_write ON etidealcrm.message_template
  FOR ALL TO authenticated
  USING (
    dealership_id = (SELECT etidealcrm.current_dealership_id())
    AND (SELECT etidealcrm.has_role('admin','sales_manager','marketing'))
  )
  WITH CHECK (dealership_id = (SELECT etidealcrm.current_dealership_id()));

-- ---------------------------------------------------------------------------
-- Grants: no anon DML
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'dealership','profile','device','setting','setting_history','supplier',
    'yard_zone','yard_slot','vehicle','vehicle_event','vehicle_work',
    'vehicle_condition','vehicle_damage','vehicle_photo','listing',
    'customer','lead','lead_event','conversation','appointment',
    'deal','deal_item','contract','import_job','import_row','outbox',
    'notification','message_template'
  ]
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON etidealcrm.%I TO authenticated, service_role', t);
    EXECUTE format('REVOKE ALL ON etidealcrm.%I FROM anon, PUBLIC', t);
  END LOOP;
END $$;

GRANT SELECT ON etidealcrm.vehicle_stock TO authenticated, service_role;
GRANT SELECT ON etidealcrm.vehicle_public TO authenticated, service_role;
GRANT SELECT ON etidealcrm.deal_margin TO authenticated, service_role;
GRANT SELECT ON etidealcrm.lead_open TO authenticated, service_role;
REVOKE ALL ON etidealcrm.vehicle_stock FROM anon, PUBLIC;
REVOKE ALL ON etidealcrm.vehicle_public FROM anon, PUBLIC;
REVOKE ALL ON etidealcrm.deal_margin FROM anon, PUBLIC;
REVOKE ALL ON etidealcrm.lead_open FROM anon, PUBLIC;

ALTER DEFAULT PRIVILEGES IN SCHEMA etidealcrm
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Minimal seed: one dealership + default settings (no users)
-- ---------------------------------------------------------------------------

INSERT INTO etidealcrm.dealership (id, name, vat_number, address, timezone)
VALUES (
  '10000000-0000-4000-8000-000000000001',
  'EtiDeal Concessionario',
  NULL,
  NULL,
  'Europe/Rome'
);

INSERT INTO etidealcrm.setting (dealership_id, key, value) VALUES
(
  '10000000-0000-4000-8000-000000000001',
  'lead_timers',
  '{
    "work_hours": {"mon-fri": ["09:00", "19:00"], "sat": ["09:00", "13:00"], "holidays": []},
    "timers_min": {
      "new": 2, "qualified": 5, "assigned": 15, "contacted": 2880,
      "visited": 1440, "proposal_sent": 4320, "negotiating": 10080
    },
    "escalation_assigned_min": {"warn_salesperson": 15, "warn_manager": 30, "reassign": 60},
    "max_reassignments": 3,
    "auto_lose_days": 30
  }'::jsonb
),
(
  '10000000-0000-4000-8000-000000000001',
  'value_bands',
  '{"A": {"max": 10000}, "B": {"min": 10000, "max": 20000}, "C": {"min": 20000, "max": 35000}, "D": {"min": 35000}}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000001',
  'assignment_weights',
  '{"performance": 0.40, "rotation": 0.40, "load": 0.20}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000001',
  'assignment_params',
  '{"max_open_leads": 15, "min_share": 0.08, "max_hot_share": 0.25, "band_c_above_median": true, "band_d_top_n": 3}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000001',
  'ai_switches',
  '{"voice": true, "whatsapp": true, "social": false, "mode": "always", "out_of_hours_reply": true}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000001',
  'ai_handoff',
  '{"on_customer_request": true, "after_unanswered_questions": 3, "price_bands": ["D"]}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000001',
  'vehicle_alerts',
  '{
    "incoming_past_eta": true,
    "received_intake_hours": 24,
    "reconditioning_days": 10,
    "ready_publish_days": 2,
    "published_warn_days": 60,
    "published_markdown_days": 90,
    "reserved_days": 10,
    "delivering_days": 7,
    "withdrawn_days": 30
  }'::jsonb
),
(
  '10000000-0000-4000-8000-000000000001',
  'portal_rules',
  '{"on_reserved": "suspend"}'::jsonb
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE etidealcrm.vehicle;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
