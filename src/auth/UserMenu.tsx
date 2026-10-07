import { Link } from 'react-router-dom'
import { useAuth } from './AuthProvider'

export default function UserMenu() {
  const { signOut } = useAuth()
  return (
    <div className="usermenu">
      <Link className="btn sm ghost" to="/set-password">Change password</Link>
      <button className="btn sm ghost" onClick={signOut}>Sign out</button>
    </div>
  )
}
