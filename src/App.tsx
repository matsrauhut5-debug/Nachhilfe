import { Navigate, Route, Routes } from 'react-router-dom'
import LoginPage from './auth/LoginPage'
import FamilyPage from './family/FamilyPage'
import AdminPage from './admin/AdminPage'

export default function App() {
  return (
    <div className="wrap">
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/buchen" element={<FamilyPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}
