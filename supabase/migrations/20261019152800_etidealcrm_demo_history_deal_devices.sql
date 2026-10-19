INSERT INTO etidealcrm.customer (id, dealership_id, first_name, last_name, phone, is_demo)
SELECT ('51000000-0000-4000-8000-' || lpad((sp*100 + n)::text, 12, '0'))::uuid, '10000000-0000-4000-8000-000000000001', 'Storico', sp::text || '-' || n::text, '+39334' || lpad((sp*100 + n)::text, 6, '0'), true
FROM generate_series(1, 7) sp CROSS JOIN generate_series(1, 50) n ON CONFLICT (id) DO NOTHING;
INSERT INTO etidealcrm.lead (dealership_id, customer_id, channel, source_ref, interest_text, price_band, status, temperature, ai_score, assigned_to, assigned_at, status_changed_at, response_minutes, lost_reason, is_demo, created_at)
SELECT '10000000-0000-4000-8000-000000000001', ('51000000-0000-4000-8000-' || lpad((t.sp*100 + n)::text, 12, '0'))::uuid, 'website', 'HIST-' || t.sp || '-' || n, 'Lead storica', CASE WHEN n % 4 = 0 THEN 'C' ELSE 'B' END, CASE WHEN n <= t.wins THEN 'won' ELSE 'lost' END::etidealcrm.lead_status, 'warm', 50, t.sid, now() - ((n % 28) || ' days')::interval, now() - ((n % 20) || ' days')::interval, t.resp, CASE WHEN n <= t.wins THEN NULL ELSE 'no_response' END::etidealcrm.lost_reason, true, now() - ((10 + n % 80) || ' days')::interval
FROM (VALUES (1,'20000000-0000-4000-8000-000000000004'::uuid,11,6),(2,'20000000-0000-4000-8000-000000000005'::uuid,14,4),(3,'20000000-0000-4000-8000-000000000006'::uuid,9,11),(4,'20000000-0000-4000-8000-000000000007'::uuid,13,7),(5,'20000000-0000-4000-8000-000000000008'::uuid,7,15),(6,'20000000-0000-4000-8000-000000000009'::uuid,10,9),(7,'20000000-0000-4000-8000-00000000000a'::uuid,8,12)) AS t(sp,sid,wins,resp)
CROSS JOIN generate_series(1, 50) n;
INSERT INTO etidealcrm.lead (dealership_id, customer_id, channel, interest_text, price_band, status, temperature, assigned_to, assigned_at, status_deadline_at, is_demo, created_at)
SELECT '10000000-0000-4000-8000-000000000001', ('51000000-0000-4000-8000-' || lpad((t.sp*100 + 1)::text, 12, '0'))::uuid, 'phone', 'Lead aperta extra', 'B', 'contacted', 'warm', t.sid, now() - interval '2 days', now() + interval '1 day', true, now() - (n || ' days')::interval
FROM (VALUES (1,'20000000-0000-4000-8000-000000000004'::uuid,8),(2,'20000000-0000-4000-8000-000000000005'::uuid,10),(3,'20000000-0000-4000-8000-000000000006'::uuid,11),(4,'20000000-0000-4000-8000-000000000007'::uuid,7),(5,'20000000-0000-4000-8000-000000000008'::uuid,14),(6,'20000000-0000-4000-8000-000000000009'::uuid,7),(7,'20000000-0000-4000-8000-00000000000a'::uuid,9)) AS t(sp,sid,extra)
CROSS JOIN LATERAL generate_series(1, t.extra) n;
INSERT INTO etidealcrm.deal (id, dealership_id, lead_id, customer_id, vehicle_id, salesperson_id, status, sale_price, deposit, financing, warranty_months, conclusion_type, is_demo) VALUES ('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000004','contract_pending',41000,2000,'{"amount":20000,"installments":60}'::jsonb,24,'on_premises', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO etidealcrm.deal_item (deal_id, type, kind, estimated, status, source) VALUES
('70000000-0000-4000-8000-000000000001','vehicle_margin','revenue',5500,'planned','auto'),
('70000000-0000-4000-8000-000000000001','financing_interest','revenue',900,'planned','fi'),
('70000000-0000-4000-8000-000000000001','insurance','revenue',350,'planned','fi'),
('70000000-0000-4000-8000-000000000001','gps','revenue',250,'planned','fi'),
('70000000-0000-4000-8000-000000000001','cvt','revenue',250,'planned','fi'),
('70000000-0000-4000-8000-000000000001','etching','revenue',150,'planned','fi'),
('70000000-0000-4000-8000-000000000001','discount','cost',500,'planned','sales'),
('70000000-0000-4000-8000-000000000001','salesperson_commission','cost',600,'planned','sales');
UPDATE etidealcrm.lead SET deal_id = '70000000-0000-4000-8000-000000000001' WHERE id = '60000000-0000-4000-8000-000000000004';
INSERT INTO etidealcrm.device (user_id, install_id, name, status, requested_at, authorized_by, authorized_at, revoked_at) VALUES
('20000000-0000-4000-8000-000000000004','demo-marco-iphone','iPhone di Marco','authorized', now() - interval '10 days', '20000000-0000-4000-8000-000000000001', now() - interval '9 days', NULL),
('20000000-0000-4000-8000-000000000004','demo-showroom-ipad','iPad showroom','authorized', now() - interval '10 days', '20000000-0000-4000-8000-000000000001', now() - interval '9 days', NULL),
('20000000-0000-4000-8000-000000000003','demo-chiara-iphone','iPhone di Chiara','authorized', now() - interval '8 days', '20000000-0000-4000-8000-000000000001', now() - interval '8 days', NULL),
('20000000-0000-4000-8000-000000000008','demo-andrea-samsung','Samsung di Andrea','pending', now() - interval '1 day', NULL, NULL, NULL),
('20000000-0000-4000-8000-000000000006','demo-luca-old','Telefono vecchio di Luca','revoked', now() - interval '40 days', '20000000-0000-4000-8000-000000000001', now() - interval '39 days', now() - interval '5 days')
ON CONFLICT (install_id) DO NOTHING;
UPDATE etidealcrm.dealership SET name = 'EtiDeal Concessionario Demo', vat_number = 'IT00000000000', address = 'Via Demo 1, 20100 Milano' WHERE id = '10000000-0000-4000-8000-000000000001';
