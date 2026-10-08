import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { ToastProvider } from './lib/ui'
import RequireRole from './auth/RequireRole'
import LoginPage from './auth/LoginPage'
import ForgotPasswordPage from './auth/ForgotPasswordPage'
import SetPasswordPage from './auth/SetPasswordPage'
import FamilyPage from './family/FamilyPage'
import AdminPage from './admin/AdminPage'
import PrivacyPage from './PrivacyPage'

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <div className="wrap">
          <Routes>
            <Route path="/" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/set-password" element={<SetPasswordPage />} />
            <Route path="/book" element={<RequireRole role="family"><FamilyPage /></RequireRole>} />
            <Route path="/admin" element={<RequireRole role="admin"><AdminPage /></RequireRole>} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <footer className="foot">
            <Link to="/privacy">Privacy</Link>
          </footer>
        </div>
      </ToastProvider>
    </AuthProvider>
  )
}
