import {
  HttpErrorResponse,
  type HttpHandlerFn,
  type HttpInterceptorFn,
  type HttpRequest,
} from '@angular/common/http'
import { inject } from '@angular/core'
import { Router } from '@angular/router'
import { catchError, throwError } from 'rxjs'

import { SessionService } from '../services/session.service'

export const authInterceptor: HttpInterceptorFn = (
  request: HttpRequest<unknown>,
  next: HttpHandlerFn,
) => {
  const sessionService = inject(SessionService)
  const router = inject(Router)

  return next(request).pipe(
    catchError((error: unknown) => {
      if (isUnauthorizedError(error)) {
        sessionService.clearSession()
        void router.navigate(['/login'], {
          queryParams: { returnUrl: router.url },
        })
      }

      return throwError(() => error)
    }),
  )
}

function isUnauthorizedError(error: unknown): error is HttpErrorResponse {
  return error instanceof HttpErrorResponse && error.status === 401
}
