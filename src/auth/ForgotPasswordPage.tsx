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
      setError('Du hast gerade schon einen Link angefordert. Bitte warte eine Minute.')
    } else if (error) {
      setError('Das hat nicht geklappt. Prüfe deine Internetverbindung und versuch es noch einmal.')
    } else {
      // Aus Datenschutzgründen immer dieselbe Antwort, egal ob es die Adresse gibt
      setSent(true)
    }
  }

  return (
    <div className="card authcard">
      <h1>Passwort vergessen</h1>
      {sent ? (
        <>
          <p className="muted">
            Falls ein Konto mit dieser E-Mail existiert, ist jetzt ein Link zum Zurücksetzen unterwegs. Schau auch im
            Spam-Ordner nach.
          </p>
          <Link className="btn" to="/" style={{ display: 'block', textAlign: 'center', marginTop: 18 }}>Zur Anmeldung</Link>
        </>
      ) : (
        <>
          <p className="muted">Gib deine E-Mail-Adresse ein. Wir schicken dir einen Link, mit dem du ein neues Passwort festlegst.</p>
          <form onSubmit={handleSubmit}>
            <label className="field">
              E-Mail
              <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            {error && <p className="formerror">{error}</p>}
            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? 'Einen Moment …' : 'Link schicken'}
            </button>
            <Link className="btn ghost" to="/">Zurück zur Anmeldung</Link>
          </form>
        </>
      )}
    </div>
  )
}
