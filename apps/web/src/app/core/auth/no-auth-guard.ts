import { inject } from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import { type CanActivateFn, Router } from '@angular/router'
import { filter, firstValueFrom, map, take } from 'rxjs'

import { SessionService } from './session-service'

/**
 * Prevents authenticated users from accessing the login page.
 * Redirects to /dashboard if the user already has a valid session.
 * Waits for bootstrap to resolve before deciding (same pattern as authGuard).
 */
export const noAuthGuard: CanActivateFn = (_route, _state) => {
  const router = inject(Router)
  const sessionService = inject(SessionService)

  if (sessionService.hasResolvedSession()) {
    return sessionService.isAuthenticated()
      ? router.createUrlTree(['/dashboard'])
      : true
  }

  // Wait for bootstrap to finish before deciding
  return firstValueFrom(
    toObservable(sessionService.hasResolvedSession).pipe(
      filter((resolved) => resolved),
      take(1),
      map(() =>
        sessionService.isAuthenticated()
          ? router.createUrlTree(['/dashboard'])
          : true,
      ),
    ),
  )
}
