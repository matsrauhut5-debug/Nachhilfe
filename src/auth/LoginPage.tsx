import type { FormEvent } from 'react'

export default function LoginPage() {
  function handleSubmit(e: FormEvent) {
    e.preventDefault()
  }

  return (
    <div className="card authcard">
      <h1>Nachhilfe bei Mats</h1>
      <p className="muted">Melde dich an, um Termine zu buchen.</p>
      <form onSubmit={handleSubmit}>
        <label className="field">
          E-Mail
          <input type="email" autoComplete="email" required />
        </label>
        <label className="field">
          Passwort
          <input type="password" autoComplete="current-password" required />
        </label>
        <button className="btn primary" type="submit" disabled>
          Anmelden
        </button>
        <p className="fine" style={{ margin: 0, textAlign: 'center' }}>
          Die Anmeldung wird gerade eingerichtet.
        </p>
      </form>
    </div>
  )
}
