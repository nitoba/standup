import type {
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http'

import { environment } from '../../../environments/environment'

/** API route prefixes that should be sent to the backend */
const API_PREFIXES = [
  '/standups',
  '/settings',
  '/repos',
  '/reminders',
  '/digests',
  '/auth',
  '/health',
  '/ready',
]

function isApiRequest(url: string): boolean {
  return API_PREFIXES.some((prefix) => url.startsWith(prefix))
}

export const baseUrlInterceptor: HttpInterceptorFn = (
  request: HttpRequest<unknown>,
  next: HttpHandlerFn,
) => {
  if (!isApiRequest(request.url)) {
    return next(request)
  }

  // Prepend the configured API base URL and include session cookies.
  if (environment.apiBaseUrl) {
    const crossOriginRequest = request.clone({
      url: `${environment.apiBaseUrl}${request.url}`,
      withCredentials: true,
    })
    return next(crossOriginRequest)
  }

  // Fallback for same-origin environments.
  const authenticatedRequest = request.clone({
    withCredentials: true,
  })
  return next(authenticatedRequest)
}
