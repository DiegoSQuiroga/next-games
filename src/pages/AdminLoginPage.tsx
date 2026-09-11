import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { authService } from '../services/authService'
import AdminAccessState from '../components/AdminAccessState'
import './admin-login.css'

export default function AdminLoginPage() {
  const auth = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    try { await authService.signIn(email, password) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to sign in. Please retry.') }
    finally { setPassword(''); setBusy(false) }
  }
  if (auth.status === 'staff') return <Navigate to="/admin" replace />
  if (auth.status !== 'anonymous') return <AdminAccessState state={auth} />
  return <main className="page-shell admin-login">
    <section className="admin-login__card">
      <p className="eyebrow">Next House · Reception</p>
      <h1>Staff sign in</h1>
      <p>Sign in to manage Next Games bookings.</p>
      <form onSubmit={submit} aria-busy={busy}>
        <label className="field"><span className="field__label">Email</span>
          <input className="field__input" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required value={email} onChange={e => setEmail(e.target.value)} disabled={busy} />
        </label>
        <label className="field"><span className="field__label">Password</span>
          <input className="field__input" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} disabled={busy} />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button--primary button--wide" type="submit" disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</button>
      </form>
    </section>
  </main>
}
