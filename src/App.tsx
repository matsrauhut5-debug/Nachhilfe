import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import RequireRole from './auth/RequireRole'
import LoginPage from './auth/LoginPage'
import ForgotPasswordPage from './auth/ForgotPasswordPage'
import SetPasswordPage from './auth/SetPasswordPage'
import FamilyPage from './family/FamilyPage'
import AdminPage from './admin/AdminPage'

export default function App() {
  return (
    <AuthProvider>
      <div className="wrap">
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/passwort-vergessen" element={<ForgotPasswordPage />} />
          <Route path="/passwort-setzen" element={<SetPasswordPage />} />
          <Route path="/buchen" element={<RequireRole role="family"><FamilyPage /></RequireRole>} />
          <Route path="/admin" element={<RequireRole role="admin"><AdminPage /></RequireRole>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </AuthProvider>
  )
}
