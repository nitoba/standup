import { describe, expect, it } from 'vitest'
import { routes } from './app.routes'
import { authGuard } from './guards/auth.guard'
import { noAuthGuard } from './guards/no-auth.guard'

describe('routes', () => {
  it('defines login and dashboard routes', () => {
    const paths = routes.map((route) => route.path)
    expect(paths).toContain('login')
    expect(paths).toContain('dashboard')
  })

  it('protects private routes with authGuard', () => {
    const protectedPaths = ['dashboard', 'standups/:id', 'settings']

    for (const path of protectedPaths) {
      const route = routes.find((candidate) => candidate.path === path)
      expect(route?.canActivate).toContain(authGuard)
    }
  })

  it('protects login route with noAuthGuard', () => {
    const loginRoute = routes.find((route) => route.path === 'login')
    expect(loginRoute?.canActivate).toContain(noAuthGuard)
  })
})
