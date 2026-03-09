import {
  HttpErrorResponse,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http'
import { TestBed } from '@angular/core/testing'
import { Router } from '@angular/router'
import { firstValueFrom, of, throwError } from 'rxjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SessionService } from '../services/session.service'
import { authInterceptor } from './auth.interceptor'

describe('authInterceptor', () => {
  const router = {
    url: '/dashboard?status=pending',
    navigate:
      vi.fn<(commands: unknown[], extras?: unknown) => Promise<boolean>>(),
  }
  const sessionService = {
    clearSession: vi.fn(),
  }

  beforeEach(() => {
    router.navigate.mockReset()
    router.navigate.mockResolvedValue(true)
    sessionService.clearSession.mockReset()

    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: router },
        { provide: SessionService, useValue: sessionService },
      ],
    })
  })

  it('passes the original request to the next handler', async () => {
    const request = new HttpRequest('GET', '/api/standups')
    const response = new HttpResponse()
    const next = vi.fn().mockReturnValue(of(response))

    const result = await TestBed.runInInjectionContext(() =>
      firstValueFrom(authInterceptor(request, next as never)),
    )

    expect(next).toHaveBeenCalledWith(request)
    expect(result).toBe(response)
    expect(sessionService.clearSession).not.toHaveBeenCalled()
    expect(router.navigate).not.toHaveBeenCalled()
  })

  it('clears the local session and redirects to login when the api returns 401', async () => {
    const request = new HttpRequest('GET', '/api/standups')
    const error = new HttpErrorResponse({
      status: 401,
      statusText: 'Unauthorized',
      url: request.url,
    })
    const next = vi.fn().mockReturnValue(throwError(() => error))

    await expect(
      TestBed.runInInjectionContext(() =>
        firstValueFrom(authInterceptor(request, next as never)),
      ),
    ).rejects.toBe(error)

    expect(sessionService.clearSession).toHaveBeenCalledTimes(1)
    expect(router.navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { returnUrl: '/dashboard?status=pending' },
    })
  })
})
