import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim())
    setBusy(false)
    if (error && error.status === 429) {
      setError('You just requested a link. Please wait a minute.')
    } else if (error) {
      setError('That didn\'t work. Check your internet connection and try again.')
    } else {
      // For privacy, always the same answer whether or not the address exists
      setSent(true)
    }
  }

  return (
    <div className="card authcard">
      <h1>Forgot password</h1>
      {sent ? (
        <>
          <p className="muted">
            If an account exists for this email, a reset link is on its way. Please also check your spam folder.
          </p>
          <Link className="btn" to="/" style={{ display: 'block', textAlign: 'center', marginTop: 18 }}>Back to sign in</Link>
        </>
      ) : (
        <>
          <p className="muted">Enter the email address of your account (not your username). We'll send you a link to set a new password.</p>
          <form onSubmit={handleSubmit}>
            <label className="field">
              Email
              <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            {error && <p className="formerror">{error}</p>}
            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? 'One moment …' : 'Send link'}
            </button>
            <Link className="btn ghost" to="/">Back to sign in</Link>
          </form>
        </>
      )}
    </div>
  )
}
