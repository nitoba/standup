import { TestBed } from '@angular/core/testing'
import { describe, expect, it, vi } from 'vitest'

import { AdjustModal } from './adjust-modal'

async function createFixture() {
  await TestBed.configureTestingModule({
    imports: [AdjustModal],
  }).compileComponents()

  const fixture = TestBed.createComponent(AdjustModal)

  fixture.componentRef.setInput('open', false)
  fixture.componentRef.setInput('loading', false)
  fixture.detectChanges()

  return fixture
}

function getTextarea(
  fixture: ReturnType<typeof TestBed.createComponent<AdjustModal>>,
) {
  return fixture.nativeElement.querySelector(
    'textarea',
  ) as HTMLTextAreaElement | null
}

function getButtons(
  fixture: ReturnType<typeof TestBed.createComponent<AdjustModal>>,
) {
  return Array.from(
    fixture.nativeElement.querySelectorAll('button'),
  ) as HTMLButtonElement[]
}

function getCancelButton(
  fixture: ReturnType<typeof TestBed.createComponent<AdjustModal>>,
) {
  return getButtons(fixture).find((button) =>
    button.textContent?.includes('$ cancel'),
  ) as HTMLButtonElement
}

function getSubmitButton(
  fixture: ReturnType<typeof TestBed.createComponent<AdjustModal>>,
) {
  return getButtons(fixture).find((button) =>
    button.textContent?.includes('$ submit'),
  ) as HTMLButtonElement
}

function setTextareaValue(
  fixture: ReturnType<typeof TestBed.createComponent<AdjustModal>>,
  value: string,
) {
  const textarea = getTextarea(fixture) as HTMLTextAreaElement
  textarea.value = value
  textarea.dispatchEvent(new Event('input'))
  fixture.detectChanges()
  return textarea
}

describe('AdjustModal', () => {
  it('is hidden when open is false', async () => {
    const fixture = await createFixture()

    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull()
  })

  it('shows title, textarea, and action buttons when open is true', async () => {
    const fixture = await createFixture()

    fixture.componentRef.setInput('open', true)
    fixture.detectChanges()

    const element = fixture.nativeElement as HTMLElement

    expect(element.textContent).toContain('// adjust standup')
    expect(getTextarea(fixture)).toBeTruthy()
    expect(getCancelButton(fixture)).toBeTruthy()
    expect(getSubmitButton(fixture)).toBeTruthy()
  })

  it('keeps submit disabled while the textarea is empty', async () => {
    const fixture = await createFixture()

    fixture.componentRef.setInput('open', true)
    fixture.detectChanges()

    expect(getSubmitButton(fixture).disabled).toBe(true)
  })

  it('keeps submit disabled while loading is true', async () => {
    const fixture = await createFixture()

    fixture.componentRef.setInput('open', true)
    fixture.detectChanges()
    setTextareaValue(fixture, 'rewrite the summary')

    fixture.componentRef.setInput('loading', true)
    fixture.detectChanges()

    expect(getSubmitButton(fixture).disabled).toBe(true)
  })

  it('emits trimmed text on submit', async () => {
    const fixture = await createFixture()
    const submitSpy = vi.fn()

    fixture.componentInstance.submitInstruction.subscribe(submitSpy)
    fixture.componentRef.setInput('open', true)
    fixture.detectChanges()
    setTextareaValue(fixture, '  tighten the wording  ')

    getSubmitButton(fixture).click()
    fixture.detectChanges()

    expect(submitSpy).toHaveBeenCalledWith('tighten the wording')
  })

  it('emits close on cancel', async () => {
    const fixture = await createFixture()
    const closeSpy = vi.fn()

    fixture.componentInstance.close.subscribe(closeSpy)
    fixture.componentRef.setInput('open', true)
    fixture.detectChanges()

    getCancelButton(fixture).click()

    expect(closeSpy).toHaveBeenCalledOnce()
  })

  it('resets the textarea after submit or close', async () => {
    const fixture = await createFixture()
    const closeSpy = vi.fn()

    fixture.componentInstance.close.subscribe(closeSpy)
    fixture.componentRef.setInput('open', true)
    fixture.detectChanges()
    setTextareaValue(fixture, '  first pass  ')

    getSubmitButton(fixture).click()
    fixture.detectChanges()

    expect(fixture.componentInstance.instruction()).toBe('')

    fixture.componentRef.setInput('open', false)
    fixture.detectChanges()
    fixture.componentRef.setInput('open', true)
    fixture.detectChanges()

    expect(getTextarea(fixture)?.value).toBe('')

    setTextareaValue(fixture, 'second pass')
    getCancelButton(fixture).click()
    fixture.detectChanges()

    expect(closeSpy).toHaveBeenCalledOnce()
    expect(fixture.componentInstance.instruction()).toBe('')
  })
})
