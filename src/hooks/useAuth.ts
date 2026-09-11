import { useSyncExternalStore } from 'react'
import { authService } from '../services/authService'

export function useAuth() {
  return useSyncExternalStore(authService.subscribe, authService.getSnapshot, authService.getSnapshot)
}
