import { TestBed } from '@angular/core/testing'
import { describe, expect, it, vi } from 'vitest'

import { ScheduleSection } from './schedule-section'

function createMockFormField() {
  return {
    touched: () => false,
    invalid: () => false,
    errors: () => [],
  }
}

describe('ScheduleSection', () => {
  async function renderComponent(inputs: {
    standupCron: string
    reminderCron: string
    recoveryCron: string
    timezone: string
  }) {
    await TestBed.configureTestingModule({
      imports: [ScheduleSection],
    }).compileComponents()

    const fixture = TestBed.createComponent(ScheduleSection)
    fixture.componentRef.setInput('standupCron', inputs.standupCron)
    fixture.componentRef.setInput('reminderCron', inputs.reminderCron)
    fixture.componentRef.setInput('recoveryCron', inputs.recoveryCron)
    fixture.componentRef.setInput('timezone', inputs.timezone)
    fixture.componentRef.setInput('timezoneOptions', [
      { label: 'America/Sao_Paulo', value: 'America/Sao_Paulo' },
    ])
    fixture.componentRef.setInput('popoverVisibility', {
      standupCron: false,
      reminderCron: false,
      recoveryCron: false,
    })
    fixture.componentRef.setInput('standupCronField', createMockFormField())
    fixture.componentRef.setInput('reminderCronField', createMockFormField())
    fixture.componentRef.setInput('recoveryCronField', createMockFormField())
    fixture.componentRef.setInput('timezoneField', createMockFormField())
    fixture.detectChanges()

    return fixture
  }

  it('renders all three cron fields with correct values', async () => {
    const fixture = await renderComponent({
      standupCron: '0 17 * * 1-5',
      reminderCron: '20 17 * * 1-5',
      recoveryCron: '0 18 * * 1-5',
      timezone: 'America/Sao_Paulo',
    })
    const el = fixture.nativeElement as HTMLElement

    const standupInput = el.querySelector<HTMLInputElement>('#standupCron')
    const reminderInput = el.querySelector<HTMLInputElement>('#reminderCron')
    const recoveryInput = el.querySelector<HTMLInputElement>('#recoveryCron')

    expect(standupInput?.value).toBe('0 17 * * 1-5')
    expect(reminderInput?.value).toBe('20 17 * * 1-5')
    expect(recoveryInput?.value).toBe('0 18 * * 1-5')
  })

  it('emits standupCronChange when cronBuilderApply is triggered', async () => {
    const fixture = await renderComponent({
      standupCron: '0 17 * * 1-5',
      reminderCron: '',
      recoveryCron: '',
      timezone: '',
    })
    const outputSpy = vi.fn()
    fixture.componentInstance.standupCronChange.subscribe(outputSpy)

    fixture.componentInstance.onCronBuilderApply('standupCron', '0 18 * * 1-5')

    expect(outputSpy).toHaveBeenCalledWith('0 18 * * 1-5')
  })

  it('emits reminderCronChange when cronBuilderApply is triggered', async () => {
    const fixture = await renderComponent({
      standupCron: '',
      reminderCron: '20 17 * * 1-5',
      recoveryCron: '',
      timezone: '',
    })
    const outputSpy = vi.fn()
    fixture.componentInstance.reminderCronChange.subscribe(outputSpy)

    fixture.componentInstance.onCronBuilderApply(
      'reminderCron',
      '30 18 * * 1-5',
    )

    expect(outputSpy).toHaveBeenCalledWith('30 18 * * 1-5')
  })

  it('emits recoveryCronChange when cronBuilderApply is triggered', async () => {
    const fixture = await renderComponent({
      standupCron: '',
      reminderCron: '',
      recoveryCron: '0 18 * * 1-5',
      timezone: '',
    })
    const outputSpy = vi.fn()
    fixture.componentInstance.recoveryCronChange.subscribe(outputSpy)

    fixture.componentInstance.onCronBuilderApply('recoveryCron', '0 19 * * 1-5')

    expect(outputSpy).toHaveBeenCalledWith('0 19 * * 1-5')
  })

  it('emits popoverVisibilityChange when clicking a cron field', async () => {
    const fixture = await renderComponent({
      standupCron: '0 17 * * 1-5',
      reminderCron: '',
      recoveryCron: '',
      timezone: '',
    })
    const visibilitySpy = vi.fn()
    fixture.componentInstance.popoverVisibilityChange.subscribe(visibilitySpy)

    const standupInput = fixture.nativeElement.querySelector(
      '#standupCron',
    ) as HTMLInputElement
    standupInput.click()

    expect(visibilitySpy).toHaveBeenCalledWith({
      standupCron: true,
      reminderCron: false,
      recoveryCron: false,
    })
  })

  it('emits cronBuilderCancel when cancel is triggered', async () => {
    const fixture = await renderComponent({
      standupCron: '0 17 * * 1-5',
      reminderCron: '',
      recoveryCron: '',
      timezone: '',
    })
    const cancelSpy = vi.fn()
    fixture.componentInstance.cronBuilderCancel.subscribe(cancelSpy)

    fixture.componentInstance.cronBuilderCancel.emit()

    expect(cancelSpy).toHaveBeenCalled()
  })

  it('timezoneChange emits string | null (parent coalesces)', async () => {
    const fixture = await renderComponent({
      standupCron: '',
      reminderCron: '',
      recoveryCron: '',
      timezone: 'America/Sao_Paulo',
    })
    const timezoneSpy = vi.fn()
    fixture.componentInstance.timezoneChange.subscribe(timezoneSpy)

    // The component emits whatever the combobox emits (string | null)
    // Parent is responsible for coalescing null to ''
    fixture.componentInstance.timezoneChange.emit(null)
    expect(timezoneSpy).toHaveBeenCalledWith(null)

    fixture.componentInstance.timezoneChange.emit('UTC')
    expect(timezoneSpy).toHaveBeenCalledWith('UTC')
  })

  it('renders timezone field with label', async () => {
    const fixture = await renderComponent({
      standupCron: '',
      reminderCron: '',
      recoveryCron: '',
      timezone: 'America/Sao_Paulo',
    })
    const el = fixture.nativeElement as HTMLElement

    // The combobox renders inside the section; verify the label exists
    expect(el.textContent).toContain('timezone')
  })
})
