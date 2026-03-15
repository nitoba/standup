import { TestBed } from '@angular/core/testing'
import { ActivatedRoute, convertToParamMap } from '@angular/router'
import { describe, expect, it, vi } from 'vitest'

import {
  BETTER_AUTH_CLIENT,
  type BetterAuthClient,
} from '../../core/auth/session-service'
import { LoginPage } from './login-page'

function createMockAuthClient(): BetterAuthClient {
  return {
    getSession: vi.fn().mockResolvedValue(null),
    signIn: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
  }
}

function setup(queryParams: Record<string, string> = {}) {
  const mockAuthClient = createMockAuthClient()

  TestBed.configureTestingModule({
    imports: [LoginPage],
    providers: [
      { provide: BETTER_AUTH_CLIENT, useValue: mockAuthClient },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            queryParamMap: convertToParamMap(queryParams),
          },
        },
      },
    ],
  })

  const fixture = TestBed.createComponent(LoginPage)
  fixture.detectChanges()

  return { fixture, mockAuthClient }
}

describe('LoginPage', () => {
  it('renders login prompt', () => {
    const { fixture } = setup()

    const element = fixture.nativeElement as HTMLElement
    expect(element.textContent).toContain('standup_bot')
    expect(element.textContent).toContain('entrar com Discord')
  })

  it('calls signInWithDiscord with default returnUrl when button is clicked', () => {
    const { fixture, mockAuthClient } = setup()

    const button = (fixture.nativeElement as HTMLElement).querySelector(
      'button',
    ) as HTMLButtonElement
    button.click()

    expect(mockAuthClient.signIn).toHaveBeenCalledWith('/dashboard')
  })

  it('calls signInWithDiscord with returnUrl from query params', () => {
    const { fixture, mockAuthClient } = setup({ returnUrl: '/settings' })

    const button = (fixture.nativeElement as HTMLElement).querySelector(
      'button',
    ) as HTMLButtonElement
    button.click()

    expect(mockAuthClient.signIn).toHaveBeenCalledWith('/settings')
  })
})
