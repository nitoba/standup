import { inject } from '@angular/core'
import { type CanActivateFn } from '@angular/router'

class FutureAuthService {
  readonly isAuthenticated = () => true
}

export const authGuard: CanActivateFn = () => {
  const authService = inject(FutureAuthService)
  return authService.isAuthenticated()
}

export { FutureAuthService }
