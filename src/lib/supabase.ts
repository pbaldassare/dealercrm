import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const schema = (import.meta.env.VITE_SUPABASE_SCHEMA as string | undefined) ?? 'etidealcrm'

export const supabaseConfigured = Boolean(url && anonKey)

export const supabase = createClient(url ?? 'https://invalid.local', anonKey ?? 'anon', {
  db: { schema },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
