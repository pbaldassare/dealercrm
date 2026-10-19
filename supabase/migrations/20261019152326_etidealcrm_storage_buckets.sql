INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('vehicle-photos', 'vehicle-photos', false, 10485760, ARRAY['image/jpeg','image/png','image/webp']::text[]),
  ('documents', 'documents', false, 20971520, ARRAY['application/pdf','image/jpeg','image/png']::text[]),
  ('imports', 'imports', false, 20971520, ARRAY['text/csv','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']::text[]),
  ('call-audio', 'call-audio', false, 20971520, ARRAY['audio/mpeg','audio/wav','audio/webm']::text[])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS etidealcrm_vehicle_photos ON storage.objects;
DROP POLICY IF EXISTS etidealcrm_documents ON storage.objects;
DROP POLICY IF EXISTS etidealcrm_imports ON storage.objects;
DROP POLICY IF EXISTS etidealcrm_call_audio ON storage.objects;

CREATE POLICY etidealcrm_vehicle_photos ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'vehicle-photos' AND etidealcrm.is_device_authorized())
  WITH CHECK (bucket_id = 'vehicle-photos' AND etidealcrm.is_device_authorized());
CREATE POLICY etidealcrm_documents ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'documents' AND etidealcrm.is_device_authorized())
  WITH CHECK (bucket_id = 'documents' AND etidealcrm.is_device_authorized());
CREATE POLICY etidealcrm_imports ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'imports' AND etidealcrm.is_device_authorized())
  WITH CHECK (bucket_id = 'imports' AND etidealcrm.is_device_authorized());
CREATE POLICY etidealcrm_call_audio ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'call-audio' AND etidealcrm.is_device_authorized() AND etidealcrm.has_role('admin','sales_manager'))
  WITH CHECK (bucket_id = 'call-audio' AND etidealcrm.is_device_authorized() AND etidealcrm.has_role('admin','sales_manager'));
