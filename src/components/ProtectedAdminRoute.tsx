import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import AdminAccessState from './AdminAccessState'

export default function ProtectedAdminRoute() {
  const state = useAuth()
  if (state.status === 'anonymous') return <Navigate to="/admin/login" replace />
  if (state.status !== 'staff') return <AdminAccessState state={state} />
  return <Outlet />
}
