import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { homeFor, useAuth } from './AuthProvider'
import { supabase } from '../supabase'

export default function LoginPage() {
  const { loading, session, profile } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (loading) return <p className="muted">Loading …</p>
  if (session) return <Navigate to={homeFor(profile)} replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) {
      setError(
        error.message === 'Invalid login credentials'
          ? 'Email or password is incorrect.'
          : 'Sign-in didn\'t work. Check your internet connection and try again.',
      )
    }
  }

  return (
    <div className="card authcard">
      <h1>Tutoring with Mats</h1>
      <p className="muted">Sign in to book your lessons.</p>
      <form onSubmit={handleSubmit}>
        <label className="field">
          Email
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          Password
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="formerror">{error}</p>}
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? 'One moment …' : 'Sign in'}
        </button>
        <Link className="btn ghost" to="/forgot-password">Forgot password?</Link>
      </form>
    </div>
  )
}
