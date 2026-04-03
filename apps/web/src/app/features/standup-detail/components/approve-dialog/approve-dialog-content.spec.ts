import { TestBed } from '@angular/core/testing'
import { describe, expect, it, vi } from 'vitest'
import {
  Z_MODAL_DATA,
  ZardDialogRef,
} from '../../../../shared/components/dialog'
import {
  ApproveDialogContent,
  type ApproveDialogData,
} from './approve-dialog-content'

async function createFixture(
  initialEntries?: ApproveDialogData['initialEntries'],
) {
  const close = vi.fn()
  const onSubmit = vi.fn()

  await TestBed.configureTestingModule({
    imports: [ApproveDialogContent],
    providers: [
      {
        provide: ZardDialogRef,
        useValue: { close },
      },
      {
        provide: Z_MODAL_DATA,
        useValue: {
          initialEntries: initialEntries ?? null,
          onSubmit,
        } satisfies ApproveDialogData,
      },
    ],
  }).compileComponents()

  const fixture = TestBed.createComponent(ApproveDialogContent)
  fixture.detectChanges()

  return { fixture, close, onSubmit }
}

function getInputs(
  fixture: ReturnType<typeof TestBed.createComponent<ApproveDialogContent>>,
) {
  return Array.from(
    fixture.nativeElement.querySelectorAll(
      'input',
    ) as NodeListOf<HTMLInputElement>,
  )
}

function getButtonByText(
  fixture: ReturnType<typeof TestBed.createComponent<ApproveDialogContent>>,
  label: string,
) {
  return Array.from(
    fixture.nativeElement.querySelectorAll(
      'button',
    ) as NodeListOf<HTMLButtonElement>,
  ).find((button) => button.textContent?.includes(label)) as HTMLButtonElement
}

function setInputValue(input: HTMLInputElement, value: string) {
  input.value = value
  input.dispatchEvent(new Event('input'))
}

describe('ApproveDialogContent', () => {
  it('renders one input per optional group', async () => {
    const { fixture } = await createFixture()

    expect(getInputs(fixture)).toHaveLength(2)
    expect(getButtonByText(fixture, '$ aprovar e publicar')).toBeTruthy()
  })

  it('prefills existing custom entries', async () => {
    const { fixture } = await createFixture({
      scheduledMeetings: ['Planning Backend', 'Refinamento mobile'],
      directCalls: ['Chamada com João'],
    })

    const inputs = getInputs(fixture)

    expect(inputs.map((input) => input.value)).toEqual([
      'Planning Backend',
      'Refinamento mobile',
      'Chamada com João',
    ])
  })

  it('submits null customEntries when all inputs are empty', async () => {
    const { fixture, close, onSubmit } = await createFixture()

    getButtonByText(fixture, '$ aprovar e publicar').click()
    fixture.detectChanges()

    expect(onSubmit).toHaveBeenCalledWith({ customEntries: null })
    expect(close).toHaveBeenCalledOnce()
  })

  it('adds and removes interactive inputs', async () => {
    const { fixture } = await createFixture()

    const addButtons = fixture.nativeElement.querySelectorAll(
      'button[aria-label="Adicionar reunião agendada"], button[aria-label="Adicionar chamada direta"]',
    ) as NodeListOf<HTMLButtonElement>

    addButtons[0]?.click()
    addButtons[1]?.click()
    fixture.detectChanges()

    expect(getInputs(fixture)).toHaveLength(4)

    const removeButtons = fixture.nativeElement.querySelectorAll(
      'button[aria-label^="Remover "]',
    ) as NodeListOf<HTMLButtonElement>

    removeButtons[0]?.click()
    fixture.detectChanges()

    expect(getInputs(fixture)).toHaveLength(3)
  })

  it('submits parsed custom entries when user fills optional fields', async () => {
    const { fixture, onSubmit } = await createFixture()
    const addButtons = fixture.nativeElement.querySelectorAll(
      'button[aria-label="Adicionar reunião agendada"], button[aria-label="Adicionar chamada direta"]',
    ) as NodeListOf<HTMLButtonElement>

    addButtons[0]?.click()
    addButtons[1]?.click()
    fixture.detectChanges()

    const inputs = getInputs(fixture)

    setInputValue(inputs[0]!, 'Planning Backend')
    setInputValue(inputs[1]!, 'Refinamento mobile')
    setInputValue(inputs[2]!, 'Chamada com João')
    setInputValue(inputs[3]!, 'Sync com QA')
    fixture.detectChanges()

    getButtonByText(fixture, '$ aprovar e publicar').click()

    expect(onSubmit).toHaveBeenCalledWith({
      customEntries: {
        scheduledMeetings: ['Planning Backend', 'Refinamento mobile'],
        directCalls: ['Chamada com João', 'Sync com QA'],
      },
    })
  })
})
