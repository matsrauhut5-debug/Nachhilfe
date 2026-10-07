import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { homeFor, useAuth } from './AuthProvider'
import { supabase } from '../supabase'

const MIN_LENGTH = 8

export default function SetPasswordPage() {
  const { loading, session, profile, linkError, fromEmailLink, signOut, passwordChosen } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (loading) return <p className="muted">Loading …</p>

  if (!session) {
    return (
      <div className="card authcard">
        <h1>Invalid link</h1>
        <p className="muted">{linkError ?? 'Please open the link from your email again, or request a new one.'}</p>
        <Link className="btn primary" to="/forgot-password" style={{ display: 'block', textAlign: 'center', marginTop: 18 }}>
          Request a new link
        </Link>
      </div>
    )
  }

  async function backToSignIn() {
    await signOut()
    navigate('/', { replace: true })
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < MIN_LENGTH) return setError(`Your password needs at least ${MIN_LENGTH} characters.`)
    if (password !== repeat) return setError('The two passwords don\'t match.')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) {
      setError(
        error.code === 'same_password'
          ? 'That is your current password. Please choose a new one.'
          : error.code === 'weak_password'
            ? 'This password is too weak. Please choose a longer one.'
            : 'That didn\'t work. Please try again.',
      )
      return
    }
    passwordChosen()
    navigate(homeFor(profile), { replace: true })
  }

  return (
    <div className="card authcard">
      <h1>Set password</h1>
      <p className="muted">For {session.user.email}. At least {MIN_LENGTH} characters.</p>
      <form onSubmit={handleSubmit}>
        <label className="field">
          New password
          <input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="field">
          Repeat password
          <input type="password" autoComplete="new-password" required value={repeat} onChange={(e) => setRepeat(e.target.value)} />
        </label>
        {error && <p className="formerror">{error}</p>}
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? 'One moment …' : 'Save password'}
        </button>
        {fromEmailLink ? (
          // Came from an email link: leaving must not keep them signed in without a password
          <button className="btn ghost" type="button" onClick={backToSignIn}>Back to sign in</button>
        ) : (
          <Link className="btn ghost" to={homeFor(profile)}>Cancel</Link>
        )}
      </form>
    </div>
  )
}
