INSERT INTO etidealcrm.vehicle (id, dealership_id, plate, vin, make, model, trim, kind, body_type, first_registration, mileage_km, fuel_type, gearbox, color, previous_owners, supplier_id, purchase_cost, list_price, sale_price, entry_date, status, yard_slot_id, yard_status, yard_verified_at, is_demo) VALUES
('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','ZZ101AA','WAUZZZ8V0KA101001','Audi','A3','Sportback 1.5 TFSI','used','sedan','2019-03-01',58000,'petrol','manual','white',1,'30000000-0000-4000-8000-000000000001',15200,19900,18900, CURRENT_DATE - 34, 'published', (SELECT id FROM etidealcrm.yard_slot WHERE code = 'A-12' LIMIT 1), 'in_yard', now(), true),
('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','ZZ102AA','WBAZZZ0C0L102002','BMW','X3','xDrive20d','used','suv','2021-06-01',41000,'diesel','automatic','black',1,'30000000-0000-4000-8000-000000000006',27500,33900,32500, CURRENT_DATE - 21, 'reserved', (SELECT id FROM etidealcrm.yard_slot WHERE code = 'B-03' LIMIT 1), 'in_yard', now(), true),
('40000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','ZZ103AA','ZFA3120000P103003','Fiat','Panda','1.2','used','city_car','2017-04-01',82000,'petrol','manual','red',2,'30000000-0000-4000-8000-000000000005',5600,7900,7400, CURRENT_DATE - 71, 'published', (SELECT id FROM etidealcrm.yard_slot WHERE code = 'A-07' LIMIT 1), 'in_yard', now(), true),
('40000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','ZZ104AA','WDCZZZ253GLC10404','Mercedes','GLC','220d','km0','suv','2022-02-01',28000,'diesel','automatic','grey',0,'30000000-0000-4000-8000-000000000003',34800,42900,41000, CURRENT_DATE - 12, 'published', (SELECT id FROM etidealcrm.yard_slot WHERE code = 'C-01' LIMIT 1), 'in_yard', now(), true),
('40000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','ZZ105AA','WVWZZZAUZJW105005','Volkswagen','Golf','1.6 TDI','used','sedan','2018-09-01',96000,'diesel','manual','blue',2,'30000000-0000-4000-8000-000000000004',10900,14900,13900, CURRENT_DATE - 5, 'reconditioning', (SELECT id FROM etidealcrm.yard_slot WHERE code = 'W-01' LIMIT 1), 'workshop', now(), true),
('40000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000001','ZZ106AA','JTDKDAFU50Y106006','Toyota','Yaris','Hybrid','used','city_car','2020-05-01',47000,'hybrid','automatic','silver',1,'30000000-0000-4000-8000-000000000002',11300,15200,14200, CURRENT_DATE - 3, 'ready', (SELECT id FROM etidealcrm.yard_slot WHERE code = 'B-09' LIMIT 1), 'in_yard', now(), true)
ON CONFLICT (dealership_id, plate) DO NOTHING;
INSERT INTO etidealcrm.vehicle_work (vehicle_id, kind, status, cost, started_at, ended_at, notes) VALUES
('40000000-0000-4000-8000-000000000004','mechanical','done',700, now() - interval '10 days', now() - interval '8 days','Ricondizionamento GLC'),
('40000000-0000-4000-8000-000000000005','bodywork','in_progress',NULL, now() - interval '2 days', NULL,'Carrozzeria Golf'),
('40000000-0000-4000-8000-000000000002','cleaning','done',80, now() - interval '19 days', now() - interval '19 days','Lavaggio permuta');
INSERT INTO etidealcrm.vehicle_event (vehicle_id, at, type, from_status, to_status, payload) VALUES
('40000000-0000-4000-8000-000000000002', now() - interval '21 days', 'status_change', NULL, 'received', '{"source":"trade_in"}'::jsonb),
('40000000-0000-4000-8000-000000000002', now() - interval '19 days', 'work', 'received', 'received', '{"kind":"cleaning"}'::jsonb),
('40000000-0000-4000-8000-000000000002', now() - interval '16 days', 'status_change', 'received', 'published', '{}'::jsonb),
('40000000-0000-4000-8000-000000000002', now() - interval '9 days', 'lead', 'published', 'published', '{"source_ref":"L-002"}'::jsonb),
('40000000-0000-4000-8000-000000000002', now() - interval '7 days', 'test_drive', 'published', 'published', '{}'::jsonb),
('40000000-0000-4000-8000-000000000002', now(), 'status_change', 'published', 'reserved', '{}'::jsonb);
INSERT INTO etidealcrm.vehicle_condition (id, vehicle_id, phase, fuel_level, mileage_km, keys_count, notes, taken_at) VALUES
('90000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000005','intake','quarter',96000,2,'Check ingresso Golf', now() - interval '5 days'),
('90000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000005','during','half',96012,2,'Dopo carrozzeria', now() - interval '1 days');
INSERT INTO etidealcrm.vehicle_damage (condition_id, zone, damage_type, severity, repaired) VALUES
('90000000-0000-4000-8000-000000000001','rear_bumper','scratch','light', false),
('90000000-0000-4000-8000-000000000001','front_left_door','dent','medium', false),
('90000000-0000-4000-8000-000000000002','rear_bumper','scratch','light', true),
('90000000-0000-4000-8000-000000000002','front_left_door','dent','medium', false);
INSERT INTO etidealcrm.vehicle_photo (vehicle_id, condition_id, storage_path, kind, zone)
SELECT '40000000-0000-4000-8000-000000000005', '90000000-0000-4000-8000-000000000001', 'vehicle-photos/demo/golf/' || n || '.jpg', 'required', 'angle-' || n FROM generate_series(1, 9) n;
INSERT INTO etidealcrm.listing (vehicle_id, portal, status, external_id) VALUES
('40000000-0000-4000-8000-000000000001','autoscout24','published','as-zz101'),
('40000000-0000-4000-8000-000000000003','autoscout24','published','as-zz103'),
('40000000-0000-4000-8000-000000000004','autoscout24','published','as-zz104'),
('40000000-0000-4000-8000-000000000002','autoscout24','suspended','as-zz102')
ON CONFLICT (vehicle_id, portal) DO NOTHING;
INSERT INTO etidealcrm.customer (id, dealership_id, first_name, last_name, phone, email, is_demo)
SELECT ('50000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, '10000000-0000-4000-8000-000000000001', 'Cliente', lpad(n::text, 3, '0'), '+39333000' || lpad(n::text, 4, '0'), 'cliente.' || lpad(n::text, 3, '0') || '@demo.test', true FROM generate_series(1, 6) n ON CONFLICT (id) DO NOTHING;
INSERT INTO etidealcrm.lead (id, dealership_id, customer_id, channel, source_ref, vehicle_id, interest_text, price_band, status, temperature, ai_score, assigned_to, assigned_at, status_deadline_at, reassignment_count, is_demo) VALUES
('60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','whatsapp','L-001','40000000-0000-4000-8000-000000000001','Audi A3 ancora disponibile?','B','assigned','hot',82,'20000000-0000-4000-8000-000000000007', now() - interval '20 minutes', now() + interval '10 minutes', 0, true),
('60000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','autoscout24','L-002','40000000-0000-4000-8000-000000000002','BMW X3, vorrei vederla','C','appointment_set','hot',75,'20000000-0000-4000-8000-000000000005', now() - interval '2 days', now() + interval '20 hours', 0, true),
('60000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000003','other_portal','L-003','40000000-0000-4000-8000-000000000003','Panda, secondo tentativo senza risposta','A','contacted','warm',55,'20000000-0000-4000-8000-00000000000a', now() - interval '1 day', now() + interval '1 day', 0, true),
('60000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000004','voicemail','L-004','40000000-0000-4000-8000-000000000004','Mercedes GLC, trattativa in corso','D','negotiating','hot',90,'20000000-0000-4000-8000-000000000004', now() - interval '4 days', now() + interval '3 days', 0, true),
('60000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000005','instagram','L-005','40000000-0000-4000-8000-000000000005','Golf, IA in corso','B','ai_qualifying','cold',30, NULL, NULL, now() + interval '20 hours', 0, true),
('60000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000006','website','L-006','40000000-0000-4000-8000-000000000006','Yaris, proposta inviata','B','proposal_sent','warm',62,'20000000-0000-4000-8000-000000000006', now() - interval '1 day', now() + interval '2 days', 0, true)
ON CONFLICT (id) DO NOTHING;
INSERT INTO etidealcrm.conversation (lead_id, channel, direction, body, is_ai) VALUES
('60000000-0000-4000-8000-000000000001','whatsapp','in','Buongiorno, la Audi A3 è ancora disponibile?', false),
('60000000-0000-4000-8000-000000000003','other_portal','out','Secondo tentativo: ci sei ancora?', true);
INSERT INTO etidealcrm.appointment (lead_id, vehicle_id, salesperson_id, starts_at, status) VALUES ('60000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000005', date_trunc('day', now() AT TIME ZONE 'Europe/Rome') + interval '16 hours', 'confirmed');
