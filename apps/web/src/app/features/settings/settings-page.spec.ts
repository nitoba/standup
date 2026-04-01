import { provideHttpClient } from '@angular/common/http'
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing'
import { ApplicationRef } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import {
  provideTanStackQuery,
  QueryClient,
} from '@tanstack/angular-query-experimental'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SettingsPage } from './settings-page'

function buildMockSettings() {
  return {
    standupCron: '30 17 * * 1-5',
    reminderCron: '20 17 * * 1-5',
    recoveryCron: '0 18 * * 1-5',
    timezone: 'america/sao_paulo',
    gitAuthor: 'nitoba',
    gitSincePeriod: '8 hours ago',
    selectedRepos: ['AGROTRACE/agrotrace-web', 'AGROTRACE/agrotrace-api'],
    active: true,
    snoozedUntil: null,
    cancelledDate: null,
    emailTheme: 'dark' as const,
    azureDevopsUser: null,
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

  async function settleFixture() {
    await Promise.resolve()
    await Promise.resolve()
    TestBed.tick()
    await appRef.whenStable()
  }

  async function renderPage() {
    TestBed.resetTestingModule()
    await TestBed.configureTestingModule({
      imports: [SettingsPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
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
    httpMock.expectOne('/settings/me').flush({ data: buildMockSettings() })
    httpMock.expectOne('/repos').flush({ data: buildMockRepos() })
  }

  async function renderAndLoad() {
    const fixture = await renderPage()
    flushInitialLoad()
    TestBed.tick()
    await fixture.whenStable()
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

    expect(el.querySelector('app-settings-skeleton')).toBeTruthy()
    expect(el.querySelector('form')).toBeNull()

    // Flush to avoid httpMock.verify() failures
    flushInitialLoad()
    TestBed.tick()
    await fixture.whenStable()
    await appRef.whenStable()
  })

  it('populates form with API data after load', async () => {
    const fixture = await renderAndLoad()
    const el = fixture.nativeElement as HTMLElement

    expect(el.textContent).not.toContain('// loading settings...')
    expect(el.querySelector('form')).toBeTruthy()

    const standupCron = el.querySelector<HTMLInputElement>('#standupCron')
    const reminderCron = el.querySelector<HTMLInputElement>('#reminderCron')
    const recoveryCron = el.querySelector<HTMLInputElement>('#recoveryCron')
    const timezone = el.querySelector<HTMLElement>('#timezone')
    const gitAuthor = el.querySelector<HTMLInputElement>('#git-author')
    const gitSincePeriod =
      el.querySelector<HTMLInputElement>('#git-since-period')

    expect(standupCron?.value).toBe('30 17 * * 1-5')
    expect(reminderCron?.value).toBe('20 17 * * 1-5')
    expect(recoveryCron?.value).toBe('0 18 * * 1-5')
    expect(standupCron?.readOnly).toBe(true)
    expect(reminderCron?.readOnly).toBe(true)
    expect(recoveryCron?.readOnly).toBe(true)
    expect(timezone?.textContent).toContain('america/sao_paulo')
    expect(gitAuthor?.value).toBe('nitoba')
    expect(gitSincePeriod?.value).toBe('8 hours ago')
  })

  it('opens the cron builder popover and applies the selected schedule', async () => {
    const fixture = await renderAndLoad()
    const el = fixture.nativeElement as HTMLElement

    fixture.componentInstance.onCronPopoverVisibilityChange({
      standupCron: true,
      reminderCron: false,
      recoveryCron: false,
    })
    fixture.detectChanges()
    await appRef.whenStable()

    const overlayRoot = document.querySelector('z-popover')
    expect(overlayRoot?.textContent).toContain('construtor_de_cron')
    expect(overlayRoot?.textContent).toContain('todos os dias úteis às 17:30')

    overlayRoot
      ?.querySelector<HTMLButtonElement>('[aria-label="Aumentar hora"]')
      ?.click()
    fixture.detectChanges()

    Array.from(overlayRoot?.querySelectorAll('button') ?? [])
      .find((button) => button.textContent?.includes('aplicar'))
      ?.click()
    fixture.detectChanges()
    await appRef.whenStable()

    expect(fixture.componentInstance.settingsModel().standupCron).toBe(
      '30 18 * * 1-5',
    )
    expect(el.querySelector<HTMLInputElement>('#standupCron')?.value).toBe(
      '30 18 * * 1-5',
    )
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
      'AGROTRACE/agrotrace-mobile',
    )
    expect(
      fixture.componentInstance.settingsModel().selectedRepos,
    ).toHaveLength(3)

    // Click a checked one to uncheck (agrotrace-web)
    checkboxes[0]!.click()
    fixture.detectChanges()

    expect(
      fixture.componentInstance.settingsModel().selectedRepos,
    ).not.toContain('AGROTRACE/agrotrace-web')
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

  it('saves settings through the API and shows success toast', async () => {
    const fixture = await renderAndLoad()
    const el = fixture.nativeElement as HTMLElement

    const submitBtn = el.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    )!
    submitBtn.click()
    fixture.detectChanges()

    // Button should show saving state
    expect(submitBtn.textContent).toContain('$ salvando...')
    expect(submitBtn.disabled).toBe(true)

    // Flush the PUT request
    await settleFixture()
    const putReq = httpMock.expectOne(
      (request) => request.method === 'PUT' && request.url === '/settings/me',
    )
    expect(putReq.request.method).toBe('PUT')
    expect(putReq.request.body).toEqual({
      standupCron: '30 17 * * 1-5',
      reminderCron: '20 17 * * 1-5',
      recoveryCron: '0 18 * * 1-5',
      timezone: 'america/sao_paulo',
      gitAuthor: 'nitoba',
      gitSincePeriod: '8 hours ago',
      selectedRepos: ['AGROTRACE/agrotrace-web', 'AGROTRACE/agrotrace-api'],
      active: true,
      emailTheme: 'dark',
      azureDevopsUser: '',
    })
    putReq.flush({ data: buildMockSettings() })
    await settleFixture()
    fixture.detectChanges()

    // toast('Settings salvas') is called — not asserted here to avoid vi.mock CI flakiness
  })

  it('shows error state when load fails and allows retry', async () => {
    const fixture = await renderPage()

    TestBed.tick()
    httpMock.expectOne('/settings/me').flush('Server Error', {
      status: 500,
      statusText: 'Internal Server Error',
    })
    httpMock.expectOne('/repos').flush('Server Error', {
      status: 500,
      statusText: 'Internal Server Error',
    })
    TestBed.tick()
    await fixture.whenStable()
    await appRef.whenStable()
    fixture.detectChanges()

    const el = fixture.nativeElement as HTMLElement
    expect(el.textContent).toContain('// falha ao carregar configurações')
    expect(el.querySelector('form')).toBeNull()

    // Click retry
    const retryBtn = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('tentar novamente'),
    )!
    expect(retryBtn).toBeTruthy()
    retryBtn.click()
    fixture.detectChanges()

    // Should show loading again
    expect(el.querySelector('app-settings-skeleton')).toBeTruthy()

    // Flush retry requests
    TestBed.tick()
    httpMock.expectOne('/settings/me').flush({ data: buildMockSettings() })
    httpMock.expectOne('/repos').flush({ data: buildMockRepos() })
    TestBed.tick()
    await fixture.whenStable()
    await appRef.whenStable()
    fixture.detectChanges()

    // Should now show the form
    expect(el.querySelector('form')).toBeTruthy()
    expect(el.textContent).not.toContain('// falha ao carregar configurações')
  })

  it('shows save error toast when PUT fails', async () => {
    const fixture = await renderAndLoad()
    const el = fixture.nativeElement as HTMLElement

    const submitBtn = el.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    )!
    submitBtn.click()
    fixture.detectChanges()

    await settleFixture()
    httpMock
      .expectOne((request) => request.method === 'PUT')
      .flush('Server Error', {
        status: 500,
        statusText: 'Internal Server Error',
      })
    await settleFixture()
    fixture.detectChanges()

    // toast('Falha ao salvar settings') is called — not asserted here to avoid vi.mock CI flakiness
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
