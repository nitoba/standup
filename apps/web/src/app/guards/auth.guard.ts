import { inject } from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import { type CanActivateFn, Router, type UrlTree } from '@angular/router'
import { filter, firstValueFrom, map, take } from 'rxjs'

import { SessionService } from '../services/session.service'

export const authGuard: CanActivateFn = (_route, state) => {
  const router = inject(Router)
  const sessionService = inject(SessionService)

  if (sessionService.isAuthenticated()) {
    return true
  }

  // Wait for bootstrap to resolve before deciding.
  // This handles the race condition where the guard fires before
  // bootstrap() has started or while it's still in progress.
  if (!sessionService.hasResolvedSession()) {
    return firstValueFrom(
      toObservable(sessionService.hasResolvedSession).pipe(
        filter((resolved) => resolved),
        take(1),
        map(() =>
          sessionService.isAuthenticated()
            ? true
            : createLoginUrlTree(router, state.url),
        ),
      ),
    )
  }

  return createLoginUrlTree(router, state.url)
}

function createLoginUrlTree(router: Router, returnUrl: string): UrlTree {
  return router.createUrlTree(['/login'], {
    queryParams: { returnUrl },
  })
}
