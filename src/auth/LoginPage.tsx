import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { homeFor, useAuth } from './AuthProvider'
import { supabase } from '../supabase'
import { callFunction } from '../lib/functions'

const DEACTIVATED = 'Your account has been deactivated. Please reach out to Mats.'

export default function LoginPage() {
  const { loading, session, profile } = useAuth()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (loading) return <p className="muted">Loading …</p>
  if (session) return <Navigate to={homeFor(profile)} replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const value = login.trim()
    if (value.includes('@')) {
      const { error } = await supabase.auth.signInWithPassword({ email: value, password })
      if (error) {
        setError(
          error.code === 'invalid_credentials'
            ? 'Email or password is incorrect.'
            : error.code === 'user_banned'
              ? DEACTIVATED
              : 'Sign-in didn\'t work. Check your internet connection and try again.',
        )
      }
    } else {
      // Username: the server looks up the email and returns a session
      try {
        const tokens = await callFunction<{ access_token: string; refresh_token: string }>('username-login', {
          username: value,
          password,
        })
        await supabase.auth.setSession(tokens)
      } catch (err) {
        setError((err as Error).message)
      }
    }
    setBusy(false)
  }

  return (
    <div className="card authcard">
      <h1>Tutoring with Mats</h1>
      <p className="muted">Sign in to book your lessons.</p>
      <form onSubmit={handleSubmit}>
        <label className="field">
          Email or username
          <input
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            value={login}
            onChange={(e) => setLogin(e.target.value)}
          />
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
