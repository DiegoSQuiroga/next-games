import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { useAuth } from '../hooks/useAuth'
import ProtectedAdminRoute from './ProtectedAdminRoute'

vi.mock('../hooks/useAuth', () => ({ useAuth: vi.fn() }))
// Exercise guard decisions without browser navigation or a live Supabase session.
vi.mock('react-router-dom', () => ({
  Navigate: ({ to }: { to: string }) => <span data-redirect={to} />,
  Outlet: () => <span>Protected dashboard</span>,
}))

describe('Admin route protection', () => {
  it('redirects anonymous visitors to the login route', () => {
    vi.mocked(useAuth).mockReturnValue({ status: 'anonymous', message: '' })
    expect(renderToStaticMarkup(<ProtectedAdminRoute />)).toContain('data-redirect="/admin/login"')
  })
  it('mounts the dashboard only for verified staff', () => {
    vi.mocked(useAuth).mockReturnValue({ status: 'staff', message: '' })
    expect(renderToStaticMarkup(<ProtectedAdminRoute />)).toContain('Protected dashboard')
    for (const status of ['loading', 'forbidden', 'error'] as const) {
      vi.mocked(useAuth).mockReturnValue({ status, message: 'Connection failed' })
      const html = renderToStaticMarkup(<ProtectedAdminRoute />)
      expect(html).not.toContain('Protected dashboard')
      if (status === 'forbidden') expect(html).toContain('Not authorized')
    }
  })
})
