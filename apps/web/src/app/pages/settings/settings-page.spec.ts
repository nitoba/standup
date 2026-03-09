import { provideHttpClient } from '@angular/common/http'
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing'
import { ApplicationRef } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SettingsPage } from './settings-page'

function buildMockSettings() {
  return {
    standupCron: '30 17 * * 1-5',
    reminderCron: '20 17 * * 1-5',
    recoveryCron: '0 18 * * 1-5',
    timezone: 'america/sao_paulo',
    gitAuthor: 'nitoba',
    gitSincePeriod: '16 hours ago',
    selectedRepos: ['agrotrace-web', 'agrotrace-api'],
    active: true,
    snoozedUntil: null,
    cancelledDate: null,
  }
}

function buildMockRepos() {
  return [
    { id: 'r1', name: 'agrotrace-web', project: 'AGROTRACE' },
    { id: 'r2', name: 'agrotrace-api', project: 'AGROTRACE' },
    { id: 'r3', name: 'agrotrace-mobile', project: 'AGROTRACE' },
  ]
}

describe('SettingsPage', () => {
  let httpMock: HttpTestingController
  let appRef: ApplicationRef

  async function renderPage() {
    await TestBed.configureTestingModule({
      imports: [SettingsPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents()

    httpMock = TestBed.inject(HttpTestingController)
    appRef = TestBed.inject(ApplicationRef)

    const fixture = TestBed.createComponent(SettingsPage)
    fixture.detectChanges()
    return fixture
  }

  function flushInitialLoad() {
    TestBed.tick()
    httpMock.expectOne('/api/settings/me').flush({ data: buildMockSettings() })
    httpMock.expectOne('/api/repos').flush({ data: buildMockRepos() })
  }

  async function renderAndLoad() {
    const fixture = await renderPage()
    flushInitialLoad()
    await appRef.whenStable()
    fixture.detectChanges()
    return fixture
  }

  afterEach(() => {
    httpMock.verify()
    vi.useRealTimers()
  })

  it('shows loading state while fetching settings', async () => {
    const fixture = await renderPage()
    const el = fixture.nativeElement as HTMLElement

    expect(el.textContent).toContain('// loading settings...')
    expect(el.querySelector('form')).toBeNull()

    // Flush to avoid httpMock.verify() failures
    flushInitialLoad()
    await appRef.whenStable()
  })

  it('populates form with API data after load', async () => {
    const fixture = await renderAndLoad()
    const el = fixture.nativeElement as HTMLElement

    expect(el.textContent).not.toContain('// loading settings...')
    expect(el.querySelector('form')).toBeTruthy()

    const standupCron = el.querySelector<HTMLInputElement>('#standup-cron')
    const reminderCron = el.querySelector<HTMLInputElement>('#reminder-cron')
    const recoveryCron = el.querySelector<HTMLInputElement>('#recovery-cron')
    const timezone = el.querySelector<HTMLInputElement>('#timezone')
    const gitAuthor = el.querySelector<HTMLInputElement>('#git-author')
    const gitSince = el.querySelector<HTMLInputElement>('#git-since-period')

    expect(standupCron?.value).toBe('30 17 * * 1-5')
    expect(reminderCron?.value).toBe('20 17 * * 1-5')
    expect(recoveryCron?.value).toBe('0 18 * * 1-5')
    expect(timezone?.value).toBe('america/sao_paulo')
    expect(gitAuthor?.value).toBe('nitoba')
    expect(gitSince?.value).toBe('16 hours ago')
  })

  it('shows available repos as checkboxes with correct selection', async () => {
    const fixture = await renderAndLoad()
    const el = fixture.nativeElement as HTMLElement

    const checkboxes = Array.from(
      el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    )
    expect(checkboxes).toHaveLength(3)

    // agrotrace-web and agrotrace-api are selected, agrotrace-mobile is not
    expect(checkboxes[0]!.checked).toBe(true) // agrotrace-web
    expect(checkboxes[1]!.checked).toBe(true) // agrotrace-api
    expect(checkboxes[2]!.checked).toBe(false) // agrotrace-mobile
  })

  it('toggles repo selection on checkbox click', async () => {
    const fixture = await renderAndLoad()
    const el = fixture.nativeElement as HTMLElement

    const checkboxes = Array.from(
      el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    )

    // Click the unchecked one (agrotrace-mobile)
    checkboxes[2]!.click()
    fixture.detectChanges()

    expect(fixture.componentInstance.settingsModel().selectedRepos).toContain(
      'agrotrace-mobile',
    )
    expect(
      fixture.componentInstance.settingsModel().selectedRepos,
    ).toHaveLength(3)

    // Click a checked one to uncheck (agrotrace-web)
    checkboxes[0]!.click()
    fixture.detectChanges()

    expect(
      fixture.componentInstance.settingsModel().selectedRepos,
    ).not.toContain('agrotrace-web')
    expect(
      fixture.componentInstance.settingsModel().selectedRepos,
    ).toHaveLength(2)
  })

  it('shows active toggle with correct state from API', async () => {
    const fixture = await renderAndLoad()
    const el = fixture.nativeElement as HTMLElement

    const toggle = el.querySelector<HTMLButtonElement>('[role="switch"]')!
    expect(toggle.getAttribute('aria-checked')).toBe('true')

    toggle.click()
    fixture.detectChanges()

    expect(fixture.componentInstance.settingsModel().active).toBe(false)
    expect(toggle.getAttribute('aria-checked')).toBe('false')
  })

  it('saves settings through the API and shows success feedback', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })

    const fixture = await renderAndLoad()
    const el = fixture.nativeElement as HTMLElement

    const submitBtn = el.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    )!
    submitBtn.click()
    fixture.detectChanges()

    // Button should show saving state
    expect(submitBtn.textContent).toContain('$ saving...')
    expect(submitBtn.disabled).toBe(true)

    // Flush the PUT request
    TestBed.tick()
    const putReq = httpMock.expectOne('/api/settings/me')
    expect(putReq.request.method).toBe('PUT')
    expect(putReq.request.body).toEqual({
      standupCron: '30 17 * * 1-5',
      reminderCron: '20 17 * * 1-5',
      recoveryCron: '0 18 * * 1-5',
      timezone: 'america/sao_paulo',
      gitAuthor: 'nitoba',
      gitSincePeriod: '16 hours ago',
      selectedRepos: ['agrotrace-web', 'agrotrace-api'],
      active: true,
    })
    putReq.flush({ data: buildMockSettings() })
    await appRef.whenStable()
    fixture.detectChanges()

    // Should show success feedback
    expect(el.textContent).toContain('// settings saved')
    expect(submitBtn.disabled).toBe(false)
    expect(submitBtn.textContent).toContain('$ save_settings')

    // Feedback disappears after 3 seconds
    vi.advanceTimersByTime(3000)
    fixture.detectChanges()
    expect(el.textContent).not.toContain('// settings saved')
  })

  it('shows error state when load fails and allows retry', async () => {
    const fixture = await renderPage()

    TestBed.tick()
    httpMock.expectOne('/api/settings/me').flush('Server Error', {
      status: 500,
      statusText: 'Internal Server Error',
    })
    httpMock.expectOne('/api/repos').flush('Server Error', {
      status: 500,
      statusText: 'Internal Server Error',
    })
    await appRef.whenStable()
    fixture.detectChanges()

    const el = fixture.nativeElement as HTMLElement
    expect(el.textContent).toContain('// failed to load settings')
    expect(el.querySelector('form')).toBeNull()

    // Click retry
    const retryBtn = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('retry'),
    )!
    expect(retryBtn).toBeTruthy()
    retryBtn.click()
    fixture.detectChanges()

    // Should show loading again
    expect(el.textContent).toContain('// loading settings...')

    // Flush retry requests
    TestBed.tick()
    httpMock.expectOne('/api/settings/me').flush({ data: buildMockSettings() })
    httpMock.expectOne('/api/repos').flush({ data: buildMockRepos() })
    await appRef.whenStable()
    fixture.detectChanges()

    // Should now show the form
    expect(el.querySelector('form')).toBeTruthy()
    expect(el.textContent).not.toContain('// failed to load settings')
  })

  it('shows save error feedback when PUT fails', async () => {
    const fixture = await renderAndLoad()
    const el = fixture.nativeElement as HTMLElement

    const submitBtn = el.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    )!
    submitBtn.click()
    fixture.detectChanges()

    TestBed.tick()
    httpMock.expectOne('/api/settings/me').flush('Server Error', {
      status: 500,
      statusText: 'Internal Server Error',
    })
    await appRef.whenStable()
    fixture.detectChanges()

    expect(el.textContent).toContain('// failed to save settings')
    expect(submitBtn.disabled).toBe(false)
  })

  it('does not render discordDmPreview toggle or danger zone', async () => {
    const fixture = await renderAndLoad()
    const el = fixture.nativeElement as HTMLElement

    expect(el.textContent).not.toContain('discord_dm_preview')
    expect(el.textContent).not.toContain('danger_zone')
    expect(el.textContent).not.toContain('delete_all_standups')

    // Only one toggle (active)
    const switches = Array.from(el.querySelectorAll('[role="switch"]'))
    expect(switches).toHaveLength(1)
  })
})
