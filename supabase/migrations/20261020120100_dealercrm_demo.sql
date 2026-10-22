-- Dati demo (sezione 9 della specifica). Tutto con is_demo = true; gli utenti demo hanno e-mail @demo.test.
-- Gli utenti di Supabase Auth si creano solo se manca il loro account e se è impostata la password:
--   SET app.demo_password = '...';   (mai in chiaro nel repo)

-- i dati storici nascono già nel loro stato: per questa migrazione il controllo sugli stati è spento
SELECT set_config('dealercrm.status_ok', 'on', false);

UPDATE dealercrm.dealership SET name = 'Dealer CRM Demo', vat_number = 'IT00000000000', address = 'Via Demo 1, 20100 Milano'
WHERE id = '10000000-0000-4000-8000-000000000001';

-- ===================================================================== utenti
DO $$
DECLARE
  pwd text := current_setting('app.demo_password', true);
  inst uuid;
  users jsonb := '[
    {"id":"20000000-0000-4000-8000-000000000001","email":"admin.demo@demo.test","name":"Admin Demo","role":"admin","bands":["A","B","C","D"],"avail":true},
    {"id":"20000000-0000-4000-8000-000000000002","email":"direzione@demo.test","name":"Roberto Valli","role":"owner","bands":["A","B"],"avail":true},
    {"id":"20000000-0000-4000-8000-000000000003","email":"resp.vendite@demo.test","name":"Chiara Neri","role":"sales_manager","bands":["A","B","C","D"],"avail":true},
    {"id":"20000000-0000-4000-8000-000000000004","email":"venditore.01@demo.test","name":"Marco Rinaldi","role":"salesperson","bands":["A","B","C","D"],"avail":true},
    {"id":"20000000-0000-4000-8000-000000000005","email":"venditore.02@demo.test","name":"Giulia Fontana","role":"salesperson","bands":["A","B","C","D"],"avail":true},
    {"id":"20000000-0000-4000-8000-000000000006","email":"venditore.03@demo.test","name":"Luca Ferretti","role":"salesperson","bands":["A","B"],"avail":true},
    {"id":"20000000-0000-4000-8000-000000000007","email":"venditore.04@demo.test","name":"Sara Moretti","role":"salesperson","bands":["A","B","C","D"],"avail":true},
    {"id":"20000000-0000-4000-8000-000000000008","email":"venditore.05@demo.test","name":"Andrea Colombo","role":"salesperson","bands":["A","B"],"avail":true},
    {"id":"20000000-0000-4000-8000-000000000009","email":"venditore.06@demo.test","name":"Elena Gallo","role":"salesperson","bands":["A","B"],"avail":false},
    {"id":"20000000-0000-4000-8000-00000000000a","email":"venditore.07@demo.test","name":"Davide Bruni","role":"salesperson","bands":["A","B"],"avail":true},
    {"id":"20000000-0000-4000-8000-00000000000b","email":"usato@demo.test","name":"Stefano Greco","role":"used_manager","bands":["A","B"],"avail":true},
    {"id":"20000000-0000-4000-8000-00000000000c","email":"ricondizionamento@demo.test","name":"Matteo Sala","role":"reconditioning","bands":["A","B"],"avail":true},
    {"id":"20000000-0000-4000-8000-00000000000d","email":"piazzale@demo.test","name":"Franco Leoni","role":"yard","bands":["A","B"],"avail":true},
    {"id":"20000000-0000-4000-8000-00000000000e","email":"amministrazione@demo.test","name":"Anna Conti","role":"accounting","bands":["A","B"],"avail":true},
    {"id":"20000000-0000-4000-8000-00000000000f","email":"fi@demo.test","name":"Paola Riva","role":"finance_insurance","bands":["A","B"],"avail":true},
    {"id":"20000000-0000-4000-8000-000000000010","email":"marketing@demo.test","name":"Nicola Serra","role":"marketing","bands":["A","B"],"avail":true}]';
  u jsonb; uid uuid; em text;
BEGIN
  SELECT id INTO inst FROM auth.instances LIMIT 1;
  FOR u IN SELECT * FROM jsonb_array_elements(users) LOOP
    uid := (u ->> 'id')::uuid; em := u ->> 'email';
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = uid OR email = em) THEN
      IF pwd IS NULL OR pwd = '' THEN
        RAISE NOTICE 'utente % non creato: manca app.demo_password', em;
      ELSE
        INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                                created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change, is_sso_user, is_anonymous)
        VALUES (inst, uid, 'authenticated', 'authenticated', em, extensions.crypt(pwd, extensions.gen_salt('bf')), now(),
                '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', u ->> 'name', 'is_demo', true),
                now(), now(), '', '', '', '', false, false);
        INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at, email)
        VALUES (gen_random_uuid(), uid, jsonb_build_object('sub', uid::text, 'email', em), 'email', uid::text, now(), now(), now(), em);
      END IF;
    END IF;
    IF EXISTS (SELECT 1 FROM auth.users WHERE id = uid) THEN
      INSERT INTO dealercrm.profile (id, dealership_id, full_name, role, is_active, is_available, enabled_bands)
      VALUES (uid, '10000000-0000-4000-8000-000000000001', u ->> 'name', (u ->> 'role')::dealercrm.app_role, true, (u ->> 'avail')::boolean,
              ARRAY(SELECT jsonb_array_elements_text(u -> 'bands')))
      ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, is_available = EXCLUDED.is_available, enabled_bands = EXCLUDED.enabled_bands;
    END IF;
  END LOOP;
END $$;

-- ===================================================================== fornitori e piazzale
INSERT INTO dealercrm.supplier (id, dealership_id, name, type, reliability, is_demo) VALUES
  ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Asta Nord Auto','auction',4,true),
  ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Autoimport Demo','import',3,true),
  ('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','Rossi Auto','dealer',4,true),
  ('30000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','NoleggioPiù','rental_company',5,true),
  ('30000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','G. Bianchi','private',3,true),
  ('30000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000001','Permuta cliente C-014','customer_trade_in',4,true);

INSERT INTO dealercrm.yard_zone (id, dealership_id, code, name) VALUES
  ('80000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','A','Zona A'),
  ('80000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','B','Zona B'),
  ('80000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','C','Zona C'),
  ('80000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','W','Officina');
INSERT INTO dealercrm.yard_slot (zone_id, code, lat, lng)
SELECT z.id, z.code || '-' || lpad(n::text, 2, '0'), z.lat0 + n * 0.00008, z.lng0 + n * 0.00005
FROM (VALUES ('80000000-0000-4000-8000-000000000001'::uuid, 'A', 20, 45.464, 9.190),
             ('80000000-0000-4000-8000-000000000002'::uuid, 'B', 15, 45.465, 9.191),
             ('80000000-0000-4000-8000-000000000003'::uuid, 'C', 6, 45.466, 9.192),
             ('80000000-0000-4000-8000-000000000004'::uuid, 'W', 4, 45.463, 9.189)) AS z(id, code, slots, lat0, lng0)
CROSS JOIN LATERAL generate_series(1, z.slots) n;

-- ===================================================================== veicoli
INSERT INTO dealercrm.vehicle (id, dealership_id, plate, vin, make, model, trim, kind, body_type, first_registration, mileage_km, fuel_type, gearbox, color,
  previous_owners, supplier_id, purchase_cost, list_price, sale_price, entry_date, status, yard_slot_id, yard_status, yard_verified_at, is_demo)
SELECT x.id::uuid, '10000000-0000-4000-8000-000000000001', x.plate, x.vin, x.make, x.model, x.trim, x.kind::dealercrm.vehicle_kind, x.body::dealercrm.body_type,
  x.reg::date, x.km, x.fuel, x.gear, x.color, x.owners, x.supplier::uuid, x.cost, x.list, x.price, current_date - x.days, x.status::dealercrm.vehicle_status,
  (SELECT s.id FROM dealercrm.yard_slot s WHERE s.code = x.slot), x.yard::dealercrm.yard_status, now(), true
FROM (VALUES
  ('40000000-0000-4000-8000-000000000001','ZZ101AA','WAUZZZ8V0KA101001','Audi','A3','Sportback 1.5 TFSI','used','sedan','2019-03-01',58000,'petrol','manual','white',1,'30000000-0000-4000-8000-000000000001',15200,19900,18900,34,'published','A-12','in_yard'),
  ('40000000-0000-4000-8000-000000000002','ZZ102AA','WBAZZZ0C0L102002','BMW','X3','xDrive20d','used','suv','2021-06-01',41000,'diesel','automatic','black',1,'30000000-0000-4000-8000-000000000006',27500,33900,32500,21,'reserved','B-03','in_yard'),
  ('40000000-0000-4000-8000-000000000003','ZZ103AA','ZFA3120000P103003','Fiat','Panda','1.2','used','city_car','2017-04-01',82000,'petrol','manual','red',2,'30000000-0000-4000-8000-000000000005',5600,7900,7400,71,'published','A-07','in_yard'),
  ('40000000-0000-4000-8000-000000000004','ZZ104AA','WDCZZZ253GLC10404','Mercedes','GLC','220d','km0','suv','2022-02-01',28000,'diesel','automatic','grey',0,'30000000-0000-4000-8000-000000000003',34800,42900,41000,12,'published','C-01','in_yard'),
  ('40000000-0000-4000-8000-000000000005','ZZ105AA','WVWZZZAUZJW105005','Volkswagen','Golf','1.6 TDI','used','sedan','2018-09-01',96000,'diesel','manual','blue',2,'30000000-0000-4000-8000-000000000004',10900,14900,13900,5,'reconditioning','W-01','workshop'),
  ('40000000-0000-4000-8000-000000000006','ZZ106AA','JTDKDAFU50Y106006','Toyota','Yaris','Hybrid','used','city_car','2020-05-01',47000,'hybrid','automatic','silver',1,'30000000-0000-4000-8000-000000000002',11300,15200,14200,3,'ready','B-09','in_yard')
) AS x(id, plate, vin, make, model, trim, kind, body, reg, km, fuel, gear, color, owners, supplier, cost, list, price, days, status, slot, yard);

INSERT INTO dealercrm.vehicle_work (vehicle_id, kind, status, cost, started_at, ended_at, notes) VALUES
  ('40000000-0000-4000-8000-000000000004','mechanical','done',700, now() - interval '10 days', now() - interval '8 days','Ricondizionamento GLC'),
  ('40000000-0000-4000-8000-000000000005','bodywork','in_progress',NULL, now() - interval '2 days', NULL,'Carrozzeria Golf'),
  ('40000000-0000-4000-8000-000000000002','cleaning','done',80, now() - interval '19 days', now() - interval '19 days','Lavaggio permuta');
INSERT INTO dealercrm.vehicle_event (vehicle_id, at, type, from_status, to_status, payload) VALUES
  ('40000000-0000-4000-8000-000000000002', now() - interval '21 days', 'status_change', NULL, 'received', '{"source":"trade_in"}'),
  ('40000000-0000-4000-8000-000000000002', now() - interval '19 days', 'work', 'received', 'received', '{"kind":"cleaning"}'),
  ('40000000-0000-4000-8000-000000000002', now() - interval '16 days', 'status_change', 'received', 'published', '{}'),
  ('40000000-0000-4000-8000-000000000002', now() - interval '9 days', 'lead', 'published', 'published', '{"source_ref":"L-002"}'),
  ('40000000-0000-4000-8000-000000000002', now() - interval '7 days', 'test_drive', 'published', 'published', '{}'),
  ('40000000-0000-4000-8000-000000000002', now(), 'status_change', 'published', 'reserved', '{}');
INSERT INTO dealercrm.vehicle_condition (id, vehicle_id, phase, fuel_level, mileage_km, keys_count, notes, taken_at) VALUES
  ('90000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000005','intake','quarter',96000,2,'Check ingresso Golf', now() - interval '5 days'),
  ('90000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000005','during','half',96012,2,'Dopo carrozzeria', now() - interval '1 days');
INSERT INTO dealercrm.vehicle_damage (condition_id, zone, damage_type, severity, repaired) VALUES
  ('90000000-0000-4000-8000-000000000001','rear_bumper','scratch','light', false),
  ('90000000-0000-4000-8000-000000000001','front_left_door','dent','medium', false),
  ('90000000-0000-4000-8000-000000000002','rear_bumper','scratch','light', true),
  ('90000000-0000-4000-8000-000000000002','front_left_door','dent','medium', false);
INSERT INTO dealercrm.vehicle_photo (vehicle_id, condition_id, storage_path, kind, zone)
SELECT '40000000-0000-4000-8000-000000000005', '90000000-0000-4000-8000-000000000001', 'demo/golf/' || n || '.jpg', 'required', 'angle-' || n
FROM generate_series(1, 9) n;
INSERT INTO dealercrm.listing (vehicle_id, portal, status, external_id) VALUES
  ('40000000-0000-4000-8000-000000000001','autoscout24','published','as-zz101'),
  ('40000000-0000-4000-8000-000000000003','autoscout24','published','as-zz103'),
  ('40000000-0000-4000-8000-000000000004','autoscout24','published','as-zz104'),
  ('40000000-0000-4000-8000-000000000002','autoscout24','suspended','as-zz102');

-- ===================================================================== clienti e lead
INSERT INTO dealercrm.customer (id, dealership_id, first_name, last_name, phone, email, is_demo)
SELECT ('50000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, '10000000-0000-4000-8000-000000000001', 'Cliente', lpad(n::text, 3, '0'),
       '+39333000' || lpad(n::text, 4, '0'), 'cliente.' || lpad(n::text, 3, '0') || '@demo.test', true
FROM generate_series(1, 6) n;

INSERT INTO dealercrm.lead (id, dealership_id, customer_id, channel, source_ref, vehicle_id, interest_text, price_band, status, temperature, ai_score,
  assigned_to, assigned_at, status_deadline_at, is_demo) VALUES
  ('60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','whatsapp','L-001','40000000-0000-4000-8000-000000000001','Audi A3 ancora disponibile?','B','assigned','hot',82,'20000000-0000-4000-8000-000000000007', now() - interval '20 minutes', now() + interval '10 minutes', true),
  ('60000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','autoscout24','L-002','40000000-0000-4000-8000-000000000002','BMW X3, vorrei vederla','C','appointment_set','hot',75,'20000000-0000-4000-8000-000000000005', now() - interval '2 days', now() + interval '20 hours', true),
  ('60000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000003','other_portal','L-003','40000000-0000-4000-8000-000000000003','Panda, secondo tentativo senza risposta','A','contacted','warm',55,'20000000-0000-4000-8000-00000000000a', now() - interval '1 day', now() + interval '1 day', true),
  ('60000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000004','voicemail','L-004','40000000-0000-4000-8000-000000000004','Mercedes GLC, trattativa in corso','D','negotiating','hot',90,'20000000-0000-4000-8000-000000000004', now() - interval '4 days', now() + interval '3 days', true),
  ('60000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000005','instagram','L-005','40000000-0000-4000-8000-000000000005','Golf, IA in corso','B','ai_qualifying','cold',30, NULL, NULL, now() + interval '20 hours', true),
  ('60000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000006','website','L-006','40000000-0000-4000-8000-000000000006','Yaris, proposta inviata','B','proposal_sent','warm',62,'20000000-0000-4000-8000-000000000006', now() - interval '1 day', now() + interval '2 days', true);
INSERT INTO dealercrm.conversation (lead_id, channel, direction, body, is_ai) VALUES
  ('60000000-0000-4000-8000-000000000001','whatsapp','in','Buongiorno, la Audi A3 è ancora disponibile?', false),
  ('60000000-0000-4000-8000-000000000003','other_portal','out','Secondo tentativo: ci sei ancora?', true);
INSERT INTO dealercrm.appointment (lead_id, vehicle_id, salesperson_id, starts_at, status) VALUES
  ('60000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000005',
   date_trunc('day', now() AT TIME ZONE 'Europe/Rome') AT TIME ZONE 'Europe/Rome' + interval '16 hours', 'confirmed');

-- storico: circa 50 lead chiuse per venditore, con i tassi di chiusura della specifica
INSERT INTO dealercrm.customer (id, dealership_id, first_name, last_name, phone, is_demo)
SELECT ('51000000-0000-4000-8000-' || lpad((sp * 100 + n)::text, 12, '0'))::uuid, '10000000-0000-4000-8000-000000000001', 'Storico', sp || '-' || n,
       '+39334' || lpad((sp * 100 + n)::text, 6, '0'), true
FROM generate_series(1, 7) sp CROSS JOIN generate_series(1, 50) n;
INSERT INTO dealercrm.lead (dealership_id, customer_id, channel, source_ref, interest_text, price_band, status, temperature, ai_score, assigned_to, assigned_at,
  status_changed_at, response_minutes, lost_reason, is_demo, created_at)
SELECT '10000000-0000-4000-8000-000000000001', ('51000000-0000-4000-8000-' || lpad((t.sp * 100 + n)::text, 12, '0'))::uuid, 'website', 'HIST-' || t.sp || '-' || n,
  'Lead storica', CASE WHEN n % 4 = 0 THEN 'C' ELSE 'B' END, CASE WHEN n <= t.wins THEN 'won' ELSE 'lost' END::dealercrm.lead_status, 'warm', 50, t.sid,
  now() - ((n % 28) || ' days')::interval, now() - ((n % 20) || ' days')::interval, t.resp,
  CASE WHEN n <= t.wins THEN NULL ELSE 'no_response' END::dealercrm.lost_reason, true, now() - ((10 + n % 80) || ' days')::interval
FROM (VALUES (1,'20000000-0000-4000-8000-000000000004'::uuid,11,6), (2,'20000000-0000-4000-8000-000000000005'::uuid,14,4),
             (3,'20000000-0000-4000-8000-000000000006'::uuid,9,11), (4,'20000000-0000-4000-8000-000000000007'::uuid,13,7),
             (5,'20000000-0000-4000-8000-000000000008'::uuid,7,15), (6,'20000000-0000-4000-8000-000000000009'::uuid,10,9),
             (7,'20000000-0000-4000-8000-00000000000a'::uuid,8,12)) AS t(sp, sid, wins, resp)
CROSS JOIN generate_series(1, 50) n;
-- lead aperte per arrivare al carico della specifica (senza source_ref: non compaiono in Oggi)
INSERT INTO dealercrm.lead (dealership_id, customer_id, channel, interest_text, price_band, status, temperature, assigned_to, assigned_at, status_deadline_at, is_demo, created_at)
SELECT '10000000-0000-4000-8000-000000000001', ('51000000-0000-4000-8000-' || lpad((t.sp * 100 + 1)::text, 12, '0'))::uuid, 'phone', 'Lead aperta extra', 'B',
  'contacted', 'warm', t.sid, now() - interval '2 days', now() + interval '1 day', true, now() - (n || ' days')::interval
FROM (VALUES (1,'20000000-0000-4000-8000-000000000004'::uuid,8), (2,'20000000-0000-4000-8000-000000000005'::uuid,10),
             (3,'20000000-0000-4000-8000-000000000006'::uuid,11), (4,'20000000-0000-4000-8000-000000000007'::uuid,7),
             (5,'20000000-0000-4000-8000-000000000008'::uuid,14), (6,'20000000-0000-4000-8000-000000000009'::uuid,7),
             (7,'20000000-0000-4000-8000-00000000000a'::uuid,9)) AS t(sp, sid, extra)
CROSS JOIN LATERAL generate_series(1, t.extra) n;

-- ===================================================================== pratica P-001
-- Il trigger aggiunge da solo "margine veicolo" 5.500 (41.000 - 34.800 - 700) e, con la caparra, riserva la GLC.
INSERT INTO dealercrm.deal (id, dealership_id, lead_id, customer_id, vehicle_id, salesperson_id, status, sale_price, deposit, financing, warranty_months,
  conclusion_type, is_demo) VALUES
  ('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000004',
   '50000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000004',
   'contract_pending',41000,2000,'{"amount":20000,"installments":60}',24,'on_premises', true);
INSERT INTO dealercrm.deal_item (deal_id, type, kind, estimated, status, source) VALUES
  ('70000000-0000-4000-8000-000000000001','financing_interest','revenue',900,'planned','fi'),
  ('70000000-0000-4000-8000-000000000001','insurance','revenue',350,'planned','fi'),
  ('70000000-0000-4000-8000-000000000001','gps','revenue',250,'planned','fi'),
  ('70000000-0000-4000-8000-000000000001','cvt','revenue',250,'planned','fi'),
  ('70000000-0000-4000-8000-000000000001','etching','revenue',150,'planned','fi'),
  ('70000000-0000-4000-8000-000000000001','discount','cost',500,'planned','sales'),
  ('70000000-0000-4000-8000-000000000001','salesperson_commission','cost',600,'planned','sales');
UPDATE dealercrm.lead SET deal_id = '70000000-0000-4000-8000-000000000001' WHERE id = '60000000-0000-4000-8000-000000000004';

-- ===================================================================== dispositivi
INSERT INTO dealercrm.device (user_id, install_id, name, status, requested_at, authorized_by, authorized_at, revoked_at)
SELECT x.uid::uuid, x.install, x.name, x.status::dealercrm.device_status, now() - x.req * interval '1 day',
       CASE WHEN x.status <> 'pending' THEN '20000000-0000-4000-8000-000000000001'::uuid END,
       CASE WHEN x.status <> 'pending' THEN now() - (x.req - 1) * interval '1 day' END,
       CASE WHEN x.status = 'revoked' THEN now() - interval '5 days' END
FROM (VALUES ('20000000-0000-4000-8000-000000000004','demo-marco-iphone','iPhone di Marco','authorized',10),
             ('20000000-0000-4000-8000-000000000004','demo-showroom-ipad','iPad showroom','authorized',10),
             ('20000000-0000-4000-8000-000000000003','demo-chiara-iphone','iPhone di Chiara','authorized',8),
             ('20000000-0000-4000-8000-000000000008','demo-andrea-samsung','Samsung di Andrea','pending',1),
             ('20000000-0000-4000-8000-000000000006','demo-luca-old','Telefono vecchio di Luca','revoked',40)) AS x(uid, install, name, status, req)
WHERE EXISTS (SELECT 1 FROM dealercrm.profile p WHERE p.id = x.uid::uuid);

SELECT set_config('dealercrm.status_ok', 'off', false);
