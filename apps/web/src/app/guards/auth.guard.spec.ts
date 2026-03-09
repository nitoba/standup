import { TestBed } from '@angular/core/testing'
import { describe, expect, it } from 'vitest'

import { authGuard, FutureAuthService } from './auth.guard'

describe('authGuard', () => {
  it('allows activation while auth is still a skeleton', () => {
    TestBed.configureTestingModule({
      providers: [FutureAuthService],
    })

    const allowed = TestBed.runInInjectionContext(() =>
      authGuard({} as never, {} as never),
    )

    expect(allowed).toBe(true)
  })
})
