import type { AuthState } from '../services/authService'
import { authService } from '../services/authService'

export default function AdminAccessState({ state }: { state: AuthState }) {
  if (state.status === 'loading') return <main className="page-shell"><p role="status">Checking staff access...</p></main>
  return <main className="page-shell">
    <h1>{state.status === 'forbidden' ? 'Not authorized' : 'Unable to access Reception'}</h1>
    <p role="alert">{state.status === 'forbidden' ? 'This account does not have Reception access. Contact your administrator.' : state.message}</p>
    <button className="button button--secondary" onClick={() => void authService.retry()}>Retry</button>{' '}
    <button className="button button--secondary" onClick={() => void authService.signOut()}>Log out</button>
  </main>
}
