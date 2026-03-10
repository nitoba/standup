import { TestBed } from '@angular/core/testing'
import { describe, expect, it, vi } from 'vitest'
import {
  Z_MODAL_DATA,
  ZardDialogRef,
} from '../../../../shared/components/dialog'
import {
  AdjustDialogContent,
  type AdjustDialogData,
} from './adjust-dialog-content'

async function createFixture() {
  const close = vi.fn()
  const onSubmit = vi.fn()

  await TestBed.configureTestingModule({
    imports: [AdjustDialogContent],
    providers: [
      {
        provide: ZardDialogRef,
        useValue: { close },
      },
      {
        provide: Z_MODAL_DATA,
        useValue: { onSubmit } satisfies AdjustDialogData,
      },
    ],
  }).compileComponents()

  const fixture = TestBed.createComponent(AdjustDialogContent)
  fixture.detectChanges()

  return { fixture, close, onSubmit }
}

function getTextarea(
  fixture: ReturnType<typeof TestBed.createComponent<AdjustDialogContent>>,
) {
  return fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement
}

function getButtonByText(
  fixture: ReturnType<typeof TestBed.createComponent<AdjustDialogContent>>,
  label: string,
) {
  return Array.from(
    fixture.nativeElement.querySelectorAll(
      'button',
    ) as NodeListOf<HTMLButtonElement>,
  ).find((button) => button.textContent?.includes(label)) as HTMLButtonElement
}

function setTextareaValue(
  fixture: ReturnType<typeof TestBed.createComponent<AdjustDialogContent>>,
  value: string,
) {
  const textarea = getTextarea(fixture)
  textarea.value = value
  textarea.dispatchEvent(new Event('input'))
  fixture.detectChanges()
}

describe('AdjustDialogContent', () => {
  it('renders textarea and action buttons', async () => {
    const { fixture } = await createFixture()

    expect(getTextarea(fixture)).toBeTruthy()
    expect(getButtonByText(fixture, '$ cancel')).toBeTruthy()
    expect(getButtonByText(fixture, '$ submit')).toBeTruthy()
  })

  it('keeps submit disabled while textarea is empty', async () => {
    const { fixture } = await createFixture()

    expect(getButtonByText(fixture, '$ submit').disabled).toBe(true)
  })

  it('submits trimmed instruction and closes dialog', async () => {
    const { fixture, close, onSubmit } = await createFixture()

    setTextareaValue(fixture, '  tighten the wording  ')
    getButtonByText(fixture, '$ submit').click()
    fixture.detectChanges()

    expect(onSubmit).toHaveBeenCalledWith('tighten the wording')
    expect(close).toHaveBeenCalledOnce()
    expect(fixture.componentInstance.instruction()).toBe('')
  })

  it('closes dialog without submitting on cancel', async () => {
    const { fixture, close, onSubmit } = await createFixture()

    setTextareaValue(fixture, 'second pass')
    getButtonByText(fixture, '$ cancel').click()
    fixture.detectChanges()

    expect(close).toHaveBeenCalledOnce()
    expect(onSubmit).not.toHaveBeenCalled()
    expect(fixture.componentInstance.instruction()).toBe('')
  })
})
