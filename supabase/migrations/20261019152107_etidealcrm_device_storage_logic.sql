ALTER TABLE etidealcrm.profile ADD COLUMN IF NOT EXISTS enabled_bands text[] NOT NULL DEFAULT ARRAY['A','B'];
