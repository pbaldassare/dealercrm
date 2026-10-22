-- GoTrue looks up users by instance_id = 00000000-0000-0000-0000-000000000000.
-- Demo Auth rows were created with a null instance_id, so password grant returned invalid_credentials.
UPDATE auth.users
SET instance_id = '00000000-0000-0000-0000-000000000000',
    updated_at = now()
WHERE email LIKE '%@demo.test'
  AND instance_id IS NULL;
