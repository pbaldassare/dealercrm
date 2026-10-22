import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Profile } from './types'

type SessionState = {
  session: Session | null
  profile: Profile | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const SessionContext = createContext<SessionState | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load(next: Session | null) {
    setSession(next)
    setError(null)
    if (!next) {
      setProfile(null)
      setLoading(false)
      return
    }

    const profileRes = await supabase.from('profile').select('*').eq('id', next.user.id).maybeSingle()
    if (profileRes.error) {
      setError(profileRes.error.message)
      setProfile(null)
      setLoading(false)
      return
    }
    setProfile(profileRes.data as Profile | null)
    setLoading(false)
  }

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => load(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      void load(next)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const value = useMemo<SessionState>(
    () => ({
      session,
      profile,
      loading,
      error,
      refresh: async () => {
        const { data } = await supabase.auth.getSession()
        await load(data.session)
      },
      signOut: async () => {
        await supabase.auth.signOut()
      },
    }),
    [session, profile, loading, error],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside SessionProvider')
  return ctx
}
