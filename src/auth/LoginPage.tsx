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

  if (loading) return <p className="muted">Wird geladen …</p>
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
          ? 'E-Mail oder Passwort stimmt nicht.'
          : 'Anmelden hat nicht geklappt. Prüfe deine Internetverbindung und versuch es noch einmal.',
      )
    }
  }

  return (
    <div className="card authcard">
      <h1>Nachhilfe bei Mats</h1>
      <p className="muted">Melde dich an, um Termine zu buchen.</p>
      <form onSubmit={handleSubmit}>
        <label className="field">
          E-Mail
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          Passwort
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="formerror">{error}</p>}
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? 'Einen Moment …' : 'Anmelden'}
        </button>
        <Link className="btn ghost" to="/passwort-vergessen">Passwort vergessen?</Link>
      </form>
    </div>
  )
}
