import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { describe, expect, it } from 'vitest'

import { SettingsPage } from './settings-page'

describe('SettingsPage', () => {
  async function setup() {
    await TestBed.configureTestingModule({
      imports: [SettingsPage],
      providers: [provideRouter([])],
    }).compileComponents()

    const fixture = TestBed.createComponent(SettingsPage)
    fixture.detectChanges()
    return { fixture, component: fixture.componentInstance }
  }

  it('renders form inputs with default values', async () => {
    const { fixture } = await setup()
    const el = fixture.nativeElement as HTMLElement

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

  it('renders notification toggles with correct aria attributes', async () => {
    const { fixture } = await setup()
    const el = fixture.nativeElement as HTMLElement

    const switches = Array.from(el.querySelectorAll('[role="switch"]'))
    expect(switches).toHaveLength(2)
    expect(switches[0]!.getAttribute('aria-checked')).toBe('true')
    expect(switches[1]!.getAttribute('aria-checked')).toBe('true')
  })

  it('toggles notification via button click', async () => {
    const { fixture, component } = await setup()
    const el = fixture.nativeElement as HTMLElement

    const firstSwitch = el.querySelector<HTMLButtonElement>('[role="switch"]')!
    firstSwitch.click()
    fixture.detectChanges()

    expect(component.settingsModel().notifications.active).toBe(false)
    expect(firstSwitch.getAttribute('aria-checked')).toBe('false')
  })

  it('renders repository inputs with formField bindings', async () => {
    const { fixture } = await setup()
    const el = fixture.nativeElement as HTMLElement

    const repoInputs = el.querySelectorAll<HTMLInputElement>(
      'input[aria-label^="Repository"]',
    )
    const inputs = Array.from(repoInputs)
    expect(inputs).toHaveLength(3)
    expect(inputs[0]!.value).toBe('agrotrace-web')
    expect(inputs[1]!.value).toBe('agrotrace-api')
    expect(inputs[2]!.value).toBe('agrotrace-mobile')
  })

  it('adds a new empty repo on add_repo click', async () => {
    const { fixture, component } = await setup()
    const el = fixture.nativeElement as HTMLElement

    const addBtn = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('add_repo'),
    )!
    addBtn.click()
    fixture.detectChanges()

    expect(component.settingsModel().repos).toHaveLength(4)
    const repoInputs = el.querySelectorAll<HTMLInputElement>(
      'input[aria-label^="Repository"]',
    )
    const inputs = Array.from(repoInputs)
    expect(inputs).toHaveLength(4)
    expect(inputs[3]!.value).toBe('')
  })

  it('removes a repo on [x] click', async () => {
    const { fixture, component } = await setup()
    const el = fixture.nativeElement as HTMLElement

    const removeBtn = el.querySelector<HTMLButtonElement>(
      'button[aria-label="Remove repository agrotrace-web"]',
    )!
    removeBtn.click()
    fixture.detectChanges()

    expect(component.settingsModel().repos).toHaveLength(2)
    expect(component.settingsModel().repos).toEqual([
      'agrotrace-api',
      'agrotrace-mobile',
    ])
  })

  it('wraps all fields in a form element', async () => {
    const { fixture } = await setup()
    const el = fixture.nativeElement as HTMLElement

    const formEl = el.querySelector('form')
    expect(formEl).toBeTruthy()

    const submitBtn = formEl?.querySelector('button[type="submit"]')
    expect(submitBtn?.textContent).toContain('save_settings')
  })
})
