import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { StandupService } from '../../services/standup.service'
import type { Standup } from '../../types/standup'
import { StandupDetailPage } from './standup-detail-page'

const STANDUP_ID = '7f3a2b1c'
const QUEUED_FEEDBACK = '// standup queued for regeneration...'

function createStandupDetail(): Standup {
  return {
    id: STANDUP_ID,
    date: '2026-03-09',
    status: 'pending_review',
    createdAt: '2026-03-09 17:32',
    contentPreview: 'implemented retry logic',
    sections: [
      {
        title: '## o que foi feito',
        tone: 'default',
        items: ['- implemented retry logic'],
      },
    ],
    sources: [
      {
        name: 'standup-service/',
        commits: [
          {
            hash: 'abc1234',
            message: 'feat: implement retry logic',
          },
        ],
      },
    ],
  }
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void

  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return { promise, resolve, reject }
}

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

async function settleFixture(
  fixture: ReturnType<typeof TestBed.createComponent<StandupDetailPage>>,
) {
  await flushMicrotasks()
  fixture.detectChanges()
}

function getButtonByText(
  fixture: ReturnType<typeof TestBed.createComponent<StandupDetailPage>>,
  label: string,
) {
  return Array.from(
    fixture.nativeElement.querySelectorAll(
      'button',
    ) as NodeListOf<HTMLButtonElement>,
  ).find((button) => button.textContent?.includes(label)) as HTMLButtonElement
}

function getActionButtons(
  fixture: ReturnType<typeof TestBed.createComponent<StandupDetailPage>>,
) {
  return {
    approve: getButtonByText(fixture, '$ approve'),
    reject: getButtonByText(fixture, '$ reject'),
    adjust: getButtonByText(fixture, '$ adjust'),
    regenerate: getButtonByText(fixture, '$ regenerate'),
  }
}

function getAdjustTextarea(
  fixture: ReturnType<typeof TestBed.createComponent<StandupDetailPage>>,
) {
  return fixture.nativeElement.querySelector(
    'textarea',
  ) as HTMLTextAreaElement | null
}

function setAdjustInstruction(
  fixture: ReturnType<typeof TestBed.createComponent<StandupDetailPage>>,
  value: string,
) {
  const textarea = getAdjustTextarea(fixture) as HTMLTextAreaElement
  textarea.value = value
  textarea.dispatchEvent(new Event('input'))
  fixture.detectChanges()
}

async function createFixture(options?: {
  approve?: () => Promise<unknown>
  reject?: () => Promise<unknown>
  adjust?: (id: string, instruction: string) => Promise<unknown>
  regenerate?: () => Promise<unknown>
  reload?: () => Promise<void>
}) {
  const detail = signal<Standup | undefined>(createStandupDetail())
  const reload = vi.fn(options?.reload ?? (async () => {}))
  const standupResource = {
    value: detail,
    error: signal(undefined),
    isLoading: signal(false),
    hasValue: signal(true),
    status: signal('resolved' as const),
    reload,
  }
  const standupService = {
    selectStandup: vi.fn(),
    selectedStandup: standupResource,
    approve: vi.fn(options?.approve ?? (async () => {})),
    reject: vi.fn(options?.reject ?? (async () => {})),
    adjust: vi.fn(options?.adjust ?? (async () => {})),
    regenerate: vi.fn(options?.regenerate ?? (async () => {})),
  }

  await TestBed.configureTestingModule({
    imports: [StandupDetailPage],
    providers: [
      provideRouter([]),
      {
        provide: StandupService,
        useValue: standupService,
      },
    ],
  }).compileComponents()

  const fixture = TestBed.createComponent(StandupDetailPage)
  fixture.componentRef.setInput('id', STANDUP_ID)
  fixture.detectChanges()

  return {
    fixture,
    standupService,
    standupResource,
  }
}

describe('StandupDetailPage', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the detail header and all four action buttons', async () => {
    const { fixture, standupResource } = await createFixture()
    const { approve, reject, adjust, regenerate } = getActionButtons(fixture)

    const element = fixture.nativeElement as HTMLElement

    expect(standupResource.value()?.id).toBe(STANDUP_ID)
    expect(element.textContent).toContain('standup_detail')
    expect(approve.textContent).toContain('$ approve')
    expect(reject.textContent).toContain('$ reject')
    expect(adjust.textContent).toContain('$ adjust')
    expect(regenerate.textContent).toContain('$ regenerate')
    expect(element.textContent).not.toContain(QUEUED_FEEDBACK)
  })

  it('opens the adjust modal when the adjust button is clicked', async () => {
    const { fixture } = await createFixture()

    getActionButtons(fixture).adjust.click()
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeTruthy()
    expect(fixture.nativeElement.textContent).toContain('// adjust standup')
  })

  it('calls adjust with the standup id and instruction when the modal is submitted', async () => {
    const { fixture, standupService, standupResource } = await createFixture()
    const standupId = standupResource.value()?.id ?? STANDUP_ID

    getActionButtons(fixture).adjust.click()
    fixture.detectChanges()

    setAdjustInstruction(fixture, 'tighten the summary')
    getButtonByText(fixture, '$ submit').click()
    await settleFixture(fixture)

    expect(standupService.adjust).toHaveBeenCalledWith(
      standupId,
      'tighten the summary',
    )
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull()
    expect(fixture.nativeElement.textContent).toContain(QUEUED_FEEDBACK)
    expect(standupResource.reload).toHaveBeenCalledOnce()
  })

  it('disables all action buttons while an action is in flight', async () => {
    const approveDeferred = createDeferred<void>()
    const { fixture, standupService, standupResource } = await createFixture({
      approve: () => approveDeferred.promise,
    })

    const { approve, reject, adjust, regenerate } = getActionButtons(fixture)

    approve.click()
    fixture.detectChanges()

    expect(standupService.approve).toHaveBeenCalledWith(STANDUP_ID)
    expect(approve.disabled).toBe(true)
    expect(reject.disabled).toBe(true)
    expect(adjust.disabled).toBe(true)
    expect(regenerate.disabled).toBe(true)

    approveDeferred.resolve()
    await settleFixture(fixture)

    expect(standupResource.reload).toHaveBeenCalledOnce()
    expect(approve.disabled).toBe(false)
    expect(reject.disabled).toBe(false)
    expect(adjust.disabled).toBe(false)
    expect(regenerate.disabled).toBe(false)
  })

  it('shows queued feedback after regenerate and clears it after five seconds', async () => {
    vi.useFakeTimers()

    const { fixture } = await createFixture()

    expect(fixture.nativeElement.textContent).not.toContain(QUEUED_FEEDBACK)

    getActionButtons(fixture).regenerate.click()
    await settleFixture(fixture)

    expect(fixture.nativeElement.textContent).toContain(QUEUED_FEEDBACK)

    vi.advanceTimersByTime(4999)
    fixture.detectChanges()
    expect(fixture.nativeElement.textContent).toContain(QUEUED_FEEDBACK)

    vi.advanceTimersByTime(1)
    fixture.detectChanges()

    expect(fixture.nativeElement.textContent).not.toContain(QUEUED_FEEDBACK)
  })
})
