import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const schema = (import.meta.env.VITE_SUPABASE_SCHEMA as string | undefined) ?? 'etidealcrm'

export const supabaseConfigured = Boolean(url && anonKey)

const INSTALL_KEY = 'etidealcrm.install_id'

export function getInstallId(): string {
  if (typeof window === 'undefined') return 'test-install'
  const existing = localStorage.getItem(INSTALL_KEY)
  if (existing) return existing
  const id = crypto.randomUUID()
  localStorage.setItem(INSTALL_KEY, id)
  return id
}

export const supabase = createClient(url ?? 'https://invalid.local', anonKey ?? 'anon', {
  db: { schema },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  global: {
    headers: {
      'x-device-id': typeof window === 'undefined' ? '' : getInstallId(),
    },
  },
})
