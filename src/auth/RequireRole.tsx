import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { homeFor, useAuth, type Role } from './AuthProvider'

// Redirects when nobody is signed in or the role doesn't match.
// Real security lives in the database (RLS); this is only routing.
export default function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { loading, session, profile } = useAuth()
  if (loading) return <p className="muted">Loading …</p>
  if (!session) return <Navigate to="/" replace />
  if (!profile || !profile.active) return <Inactive />
  if (profile.role !== role) return <Navigate to={homeFor(profile)} replace />
  return <>{children}</>
}

function Inactive() {
  const { signOut } = useAuth()
  return (
    <div className="card authcard">
      <h1>No access</h1>
      <p className="muted">Your account is not active. Please message Mats directly.</p>
      <div className="actions" style={{ marginTop: 18 }}>
        <button className="btn" onClick={signOut}>Sign out</button>
      </div>
    </div>
  )
}
