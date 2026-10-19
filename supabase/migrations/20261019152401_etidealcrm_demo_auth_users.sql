DO $$
DECLARE
  pwd text := current_setting('app.demo_password', true);  -- SET app.demo_password = '...' prima di applicare; mai in chiaro nel repo
  inst uuid;
  users jsonb := '[{"id":"20000000-0000-4000-8000-000000000001","email":"admin.demo@demo.test","name":"Admin Demo","role":"admin","bands":["A","B","C","D"],"avail":true},{"id":"20000000-0000-4000-8000-000000000002","email":"direzione@demo.test","name":"Roberto Valli","role":"owner","bands":["A","B"],"avail":true},{"id":"20000000-0000-4000-8000-000000000003","email":"resp.vendite@demo.test","name":"Chiara Neri","role":"sales_manager","bands":["A","B","C","D"],"avail":true},{"id":"20000000-0000-4000-8000-000000000004","email":"venditore.01@demo.test","name":"Marco Rinaldi","role":"salesperson","bands":["A","B","C","D"],"avail":true},{"id":"20000000-0000-4000-8000-000000000005","email":"venditore.02@demo.test","name":"Giulia Fontana","role":"salesperson","bands":["A","B","C","D"],"avail":true},{"id":"20000000-0000-4000-8000-000000000006","email":"venditore.03@demo.test","name":"Luca Ferretti","role":"salesperson","bands":["A","B"],"avail":true},{"id":"20000000-0000-4000-8000-000000000007","email":"venditore.04@demo.test","name":"Sara Moretti","role":"salesperson","bands":["A","B","C","D"],"avail":true},{"id":"20000000-0000-4000-8000-000000000008","email":"venditore.05@demo.test","name":"Andrea Colombo","role":"salesperson","bands":["A","B"],"avail":true},{"id":"20000000-0000-4000-8000-000000000009","email":"venditore.06@demo.test","name":"Elena Gallo","role":"salesperson","bands":["A","B"],"avail":false},{"id":"20000000-0000-4000-8000-00000000000a","email":"venditore.07@demo.test","name":"Davide Bruni","role":"salesperson","bands":["A","B"],"avail":true},{"id":"20000000-0000-4000-8000-00000000000b","email":"usato@demo.test","name":"Stefano Greco","role":"used_manager","bands":["A","B"],"avail":true},{"id":"20000000-0000-4000-8000-00000000000c","email":"ricondizionamento@demo.test","name":"Matteo Sala","role":"reconditioning","bands":["A","B"],"avail":true},{"id":"20000000-0000-4000-8000-00000000000d","email":"piazzale@demo.test","name":"Franco Leoni","role":"yard","bands":["A","B"],"avail":true},{"id":"20000000-0000-4000-8000-00000000000e","email":"amministrazione@demo.test","name":"Anna Conti","role":"accounting","bands":["A","B"],"avail":true},{"id":"20000000-0000-4000-8000-00000000000f","email":"fi@demo.test","name":"Paola Riva","role":"finance_insurance","bands":["A","B"],"avail":true},{"id":"20000000-0000-4000-8000-000000000010","email":"marketing@demo.test","name":"Nicola Serra","role":"marketing","bands":["A","B"],"avail":true}]'::jsonb;
  u jsonb; uid uuid; em text; did uuid := '10000000-0000-4000-8000-000000000001';
BEGIN
  SELECT id INTO inst FROM auth.instances LIMIT 1;
  FOR u IN SELECT * FROM jsonb_array_elements(users) LOOP
    uid := (u->>'id')::uuid; em := u->>'email';
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = uid OR email = em) THEN
      BEGIN
        INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change, is_sso_user, is_anonymous)
        VALUES (inst, uid, 'authenticated', 'authenticated', em, extensions.crypt(pwd, extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('full_name', u->>'name', 'is_demo', true), now(), now(), '', '', '', '', false, false);
        INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at, email)
        VALUES (gen_random_uuid(), uid, jsonb_build_object('sub', uid::text, 'email', em), 'email', uid::text, now(), now(), now(), em);
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'auth user % failed: %', em, SQLERRM;
      END;
    END IF;
    IF EXISTS (SELECT 1 FROM auth.users WHERE id = uid) THEN
      INSERT INTO etidealcrm.profile (id, dealership_id, full_name, role, is_active, is_available, enabled_bands)
      VALUES (uid, did, u->>'name', (u->>'role')::etidealcrm.app_role, true, (u->>'avail')::boolean, ARRAY(SELECT jsonb_array_elements_text(u->'bands')))
      ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, is_available = EXCLUDED.is_available, enabled_bands = EXCLUDED.enabled_bands;
    END IF;
  END LOOP;
END $$;
