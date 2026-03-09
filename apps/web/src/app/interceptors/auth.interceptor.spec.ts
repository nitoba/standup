import { HttpRequest, HttpResponse } from '@angular/common/http'
import { describe, expect, it, vi } from 'vitest'

import { authInterceptor } from './auth.interceptor'

describe('authInterceptor', () => {
  it('passes the original request to the next handler', async () => {
    const request = new HttpRequest('GET', '/api/standups')
    const next = vi.fn().mockReturnValue(Promise.resolve(new HttpResponse()))

    await authInterceptor(request, next as never)

    expect(next).toHaveBeenCalledWith(request)
  })
})
