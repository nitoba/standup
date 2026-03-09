import {
  HttpErrorResponse,
  type HttpEvent,
  type HttpHandlerFn,
  type HttpInterceptorFn,
  type HttpRequest,
  HttpResponse,
} from '@angular/common/http'
import { delay, Observable, of, throwError } from 'rxjs'

import {
  buildMockStandups,
  filterStandups,
  updateStandupStatus,
} from '../data/mock-data'
import type { StandupStatus } from '../types/standup'

let standups = buildMockStandups()

export const mockApiInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith('/api/')) {
    return next(request)
  }

  if (request.method === 'GET' && request.url.startsWith('/api/standups/')) {
    return respondToDetail(request)
  }

  if (request.method === 'GET' && request.url === '/api/standups') {
    return respondToList(request)
  }

  if (
    request.method === 'PATCH' &&
    request.url.startsWith('/api/standups/') &&
    request.url.endsWith('/status')
  ) {
    return respondToStatusUpdate(request)
  }

  if (request.method === 'POST' && request.url === '/api/standups/trigger') {
    return withDelay({ triggered: true }, 202)
  }

  return throwError(
    () =>
      new HttpErrorResponse({
        status: 404,
        statusText: 'Not Found',
        url: request.url,
        error: { message: 'mock endpoint not found' },
      }),
  )
}

function respondToList(
  request: HttpRequest<unknown>,
): Observable<HttpEvent<unknown>> {
  const status = request.params.get('status')
  const date = request.params.get('date')
  const search = request.params.get('search')

  return withDelay(filterStandups(standups, { status, date, search }))
}

function respondToDetail(
  request: HttpRequest<unknown>,
): Observable<HttpEvent<unknown>> {
  const id = request.url.split('/').pop() ?? ''
  const standup = standups.find((item) => item.id === id)

  if (!standup) {
    return throwError(
      () =>
        new HttpErrorResponse({
          status: 404,
          statusText: 'Not Found',
          url: request.url,
          error: { message: `standup ${id} not found` },
        }),
    )
  }

  return withDelay(standup)
}

function respondToStatusUpdate(
  request: HttpRequest<unknown>,
): Observable<HttpEvent<unknown>> {
  const id = request.url.split('/')[3] ?? ''
  const body = request.body as { status?: StandupStatus }

  if (!body.status) {
    return throwError(
      () =>
        new HttpErrorResponse({
          status: 400,
          statusText: 'Bad Request',
          url: request.url,
          error: { message: 'status is required' },
        }),
    )
  }

  const updated = updateStandupStatus(standups, id, body.status)
  if (!updated) {
    return throwError(
      () =>
        new HttpErrorResponse({
          status: 404,
          statusText: 'Not Found',
          url: request.url,
          error: { message: `standup ${id} not found` },
        }),
    )
  }

  standups = standups.map((item) => (item.id === id ? updated : item))
  return withDelay(updated)
}

function withDelay(body: unknown, status = 200) {
  return of(
    new HttpResponse({
      status,
      body,
    }),
  ).pipe(delay(getMockDelay()))
}

function getMockDelay() {
  return 300 + Math.floor(Math.random() * 301)
}

export function resetMockApiState() {
  standups = buildMockStandups()
}
