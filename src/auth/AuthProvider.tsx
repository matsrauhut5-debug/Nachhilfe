import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { EmailOtpType, Session } from '@supabase/supabase-js'
import { supabase } from '../supabase'

export type Role = 'admin' | 'family'

export type Profile = {
  id: string
  role: Role
  student_name: string | null
  parent_name: string | null
  email: string
  active: boolean
}

type AuthState = {
  loading: boolean
  session: Session | null
  profile: Profile | null
  // Error from the invite/reset link, if it was invalid
  linkError: string | null
  // Signed in via an invite/reset link in this visit (no password chosen yet)
  fromEmailLink: boolean
  signOut: () => Promise<void>
  passwordChosen: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth used outside AuthProvider')
  return ctx
}

// Links from invite and password emails: ?token_hash=…&type=invite|recovery#/set-password
async function consumeEmailLink(): Promise<{ used: boolean; error: string | null }> {
  const params = new URLSearchParams(window.location.search)
  const tokenHash = params.get('token_hash')
  const type = params.get('type') as EmailOtpType | null
  if (!tokenHash || !type) return { used: false, error: null }

  // Remove the token from the address bar, keep the hash route
  window.history.replaceState(null, '', window.location.pathname + window.location.hash)

  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
  return {
    used: !error,
    error: error ? 'This link has expired or was already used. Just request a new one.' : null,
  }
}

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id, role, student_name, parent_name, email, active')
    .eq('id', userId)
    .maybeSingle()
  return data as Profile | null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [fromEmailLink, setFromEmailLink] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function apply(next: Session | null) {
      const p = next ? await loadProfile(next.user.id) : null
      if (cancelled) return
      setSession(next)
      setProfile(p)
      setLoading(false)
    }

    async function init() {
      const link = await consumeEmailLink()
      if (cancelled) return
      setLinkError(link.error)
      setFromEmailLink(link.used)
      const { data } = await supabase.auth.getSession()
      await apply(data.session)
    }

    init()

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      // Don't reload the profile on every token refresh; deferred call as recommended by the Supabase docs
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        setTimeout(() => apply(next), 0)
      } else {
        setSession(next)
      }
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  async function signOut() {
    setFromEmailLink(false)
    await supabase.auth.signOut()
  }

  function passwordChosen() {
    setFromEmailLink(false)
  }

  return (
    <AuthContext.Provider value={{ loading, session, profile, linkError, fromEmailLink, signOut, passwordChosen }}>
      {children}
    </AuthContext.Provider>
  )
}

export function homeFor(profile: Profile | null) {
  return profile?.role === 'admin' ? '/admin' : '/book'
}
