import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { homeFor, useAuth, type Role } from './AuthProvider'

// Leitet weiter, wenn niemand angemeldet ist oder die Rolle nicht passt.
// Die eigentliche Sicherheit liegt in der Datenbank (RLS); das hier ist nur die Weiche.
export default function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { loading, session, profile } = useAuth()
  if (loading) return <p className="muted">Wird geladen …</p>
  if (!session) return <Navigate to="/" replace />
  if (!profile || !profile.active) return <Inactive />
  if (profile.role !== role) return <Navigate to={homeFor(profile)} replace />
  return <>{children}</>
}

function Inactive() {
  const { signOut } = useAuth()
  return (
    <div className="card authcard">
      <h1>Kein Zugang</h1>
      <p className="muted">Dein Zugang ist nicht aktiv. Bitte schreib Mats direkt.</p>
      <div className="actions" style={{ marginTop: 18 }}>
        <button className="btn" onClick={signOut}>Abmelden</button>
      </div>
    </div>
  )
}
