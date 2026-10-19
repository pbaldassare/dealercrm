INSERT INTO etidealcrm.supplier (id, dealership_id, name, type, reliability, is_demo) VALUES
  ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Asta Nord Auto','auction',4,true),
  ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Autoimport Demo','import',3,true),
  ('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','Rossi Auto','dealer',4,true),
  ('30000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','NoleggioPiù','rental_company',5,true),
  ('30000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','G. Bianchi','private',3,true),
  ('30000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000001','Permuta cliente C-014','customer_trade_in',4,true)
ON CONFLICT (id) DO NOTHING;
INSERT INTO etidealcrm.yard_zone (id, dealership_id, code, name, geometry) VALUES
  ('80000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','A','Zona A','{"type":"Polygon"}'::jsonb),
  ('80000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','B','Zona B','{"type":"Polygon"}'::jsonb),
  ('80000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','C','Zona C','{"type":"Polygon"}'::jsonb),
  ('80000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','W','Officina','{"type":"Polygon"}'::jsonb)
ON CONFLICT (id) DO NOTHING;
INSERT INTO etidealcrm.yard_slot (id, zone_id, code, lat, lng)
SELECT ('81000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, '80000000-0000-4000-8000-000000000001', 'A-' || lpad(n::text, 2, '0'), 45.464 + n * 0.00008, 9.190 + n * 0.00005 FROM generate_series(1, 20) n ON CONFLICT (zone_id, code) DO NOTHING;
INSERT INTO etidealcrm.yard_slot (id, zone_id, code, lat, lng)
SELECT ('82000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, '80000000-0000-4000-8000-000000000002', 'B-' || lpad(n::text, 2, '0'), 45.465 + n * 0.00008, 9.191 + n * 0.00005 FROM generate_series(1, 15) n ON CONFLICT (zone_id, code) DO NOTHING;
INSERT INTO etidealcrm.yard_slot (id, zone_id, code, lat, lng)
SELECT ('83000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, '80000000-0000-4000-8000-000000000003', 'C-' || lpad(n::text, 2, '0'), 45.466 + n * 0.00008, 9.192 + n * 0.00005 FROM generate_series(1, 6) n ON CONFLICT (zone_id, code) DO NOTHING;
INSERT INTO etidealcrm.yard_slot (id, zone_id, code, lat, lng)
SELECT ('84000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, '80000000-0000-4000-8000-000000000004', 'W-' || lpad(n::text, 2, '0'), 45.463 + n * 0.00008, 9.189 + n * 0.00005 FROM generate_series(1, 4) n ON CONFLICT (zone_id, code) DO NOTHING;
