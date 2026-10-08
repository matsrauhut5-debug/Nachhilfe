import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import { Modal } from '../lib/ui'
import EmailPrefs from './EmailPrefs'

export default function UserMenu() {
  const { signOut, profile } = useAuth()
  const [emails, setEmails] = useState(false)
  return (
    <div className="usermenu">
      {profile?.role === 'family' && (
        <button className="btn sm ghost" onClick={() => setEmails(true)}>Emails</button>
      )}
      <Link className="btn sm ghost" to="/set-password">Change password</Link>
      <button className="btn sm ghost" onClick={signOut}>Sign out</button>
      {emails && (
        <Modal onClose={() => setEmails(false)}>
          <h3>Emails</h3>
          <p className="muted small" style={{ margin: '-6px 0 8px' }}>Choose which emails you want to get.</p>
          <EmailPrefs />
          <div className="actions" style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={() => setEmails(false)}>Done</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
