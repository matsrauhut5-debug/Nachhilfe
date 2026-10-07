import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { homeFor, useAuth } from './AuthProvider'
import { supabase } from '../supabase'

const MIN_LENGTH = 8

export default function SetPasswordPage() {
  const { loading, session, profile, linkError } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (loading) return <p className="muted">Wird geladen …</p>

  if (!session) {
    return (
      <div className="card authcard">
        <h1>Link ungültig</h1>
        <p className="muted">{linkError ?? 'Bitte öffne den Link aus deiner E-Mail noch einmal oder fordere einen neuen an.'}</p>
        <Link className="btn primary" to="/passwort-vergessen" style={{ display: 'block', textAlign: 'center', marginTop: 18 }}>
          Neuen Link anfordern
        </Link>
      </div>
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < MIN_LENGTH) return setError(`Das Passwort braucht mindestens ${MIN_LENGTH} Zeichen.`)
    if (password !== repeat) return setError('Die beiden Passwörter sind nicht gleich.')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) {
      setError(
        error.code === 'same_password'
          ? 'Das ist dein bisheriges Passwort. Bitte wähle ein neues.'
          : error.code === 'weak_password'
            ? 'Dieses Passwort ist zu schwach. Bitte wähle ein längeres.'
            : 'Das hat nicht geklappt. Bitte versuch es noch einmal.',
      )
      return
    }
    navigate(homeFor(profile), { replace: true })
  }

  return (
    <div className="card authcard">
      <h1>Passwort festlegen</h1>
      <p className="muted">Für {session.user.email}. Mindestens {MIN_LENGTH} Zeichen.</p>
      <form onSubmit={handleSubmit}>
        <label className="field">
          Neues Passwort
          <input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="field">
          Noch einmal
          <input type="password" autoComplete="new-password" required value={repeat} onChange={(e) => setRepeat(e.target.value)} />
        </label>
        {error && <p className="formerror">{error}</p>}
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? 'Einen Moment …' : 'Passwort speichern'}
        </button>
        <Link className="btn ghost" to={homeFor(profile)}>Abbrechen</Link>
      </form>
    </div>
  )
}
