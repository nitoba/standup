import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { toastMock } = vi.hoisted(() => ({
  toastMock: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('ngx-sonner', () => ({
  toast: toastMock,
}))

import { ZardDialogService } from '../../shared/components/dialog'
import type { Standup, StandupStatus } from '../../shared/models/standup-models'
import { StandupService } from '../dashboard/services/standup-service'
import { StandupDetailPage } from './standup-detail-page'

const STANDUP_ID = '7f3a2b1c'

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

async function createFixture(options?: {
  status?: StandupStatus
  approve?: (customEntries?: unknown) => Promise<unknown>
  reject?: () => Promise<unknown>
  adjust?: (id: string, instruction: string) => Promise<unknown>
  regenerate?: () => Promise<unknown>
  reload?: () => Promise<void>
}) {
  const detail = signal<Standup | undefined>(
    createStandupDetail(options?.status ? { status: options.status } : {}),
  )
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
    approve: vi.fn(options?.approve ?? (async () => ({ standup: detail() }))),
    reject: vi.fn(options?.reject ?? (async () => {})),
    adjust: vi.fn(options?.adjust ?? (async () => {})),
    regenerate: vi.fn(options?.regenerate ?? (async () => {})),
  }
  const dialogService = {
    create: vi.fn(),
  }

  await TestBed.configureTestingModule({
    imports: [StandupDetailPage],
    providers: [
      provideRouter([]),
      {
        provide: StandupService,
        useValue: standupService,
      },
      {
        provide: ZardDialogService,
        useValue: dialogService,
      },
    ],
  }).compileComponents()

  const fixture = TestBed.createComponent(StandupDetailPage)
  fixture.componentRef.setInput('id', STANDUP_ID)
  fixture.detectChanges()

  return {
    fixture,
    dialogService,
    standupService,
    standupResource,
  }
}

function createStandupDetail(overrides: Partial<Standup> = {}): Standup {
  return {
    id: STANDUP_ID,
    date: '2026-03-09',
    status: 'pending_review',
    createdAt: '2026-03-09 17:32',
    content: '## o que foi feito\n- implemented retry logic',
    sourceData: '{\n  "repos": []\n}',
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
    ...overrides,
  }
}

describe('StandupDetailPage', () => {
  afterEach(() => {
    vi.useRealTimers()
    toastMock.success.mockReset()
    toastMock.error.mockReset()
  })

  it('renders generated content before datasource and shows copy actions', async () => {
    const { fixture, standupResource } = await createFixture()
    const { approve, reject, adjust, regenerate } = getActionButtons(fixture)

    const element = fixture.nativeElement as HTMLElement
    const cards = Array.from(element.querySelectorAll('pre'))

    expect(standupResource.value()?.id).toBe(STANDUP_ID)
    expect(element.textContent).toContain('standup_detail')
    expect(element.textContent).toContain('generated_content')
    expect(element.textContent).toContain('datasource')
    expect(cards[0]?.textContent).toContain('## o que foi feito')
    expect(cards[1]?.textContent).toContain('"repos"')
    expect(element.textContent).toContain('$ expand')
    expect(element.textContent).toContain('preview')
    expect(element.textContent?.indexOf('generated_content')).toBeLessThan(
      element.textContent?.indexOf('datasource') ?? 0,
    )
    expect(getButtonByText(fixture, '$ copy generated').textContent).toContain(
      '$ copy generated',
    )
    expect(getButtonByText(fixture, '$ copy datasource').textContent).toContain(
      '$ copy datasource',
    )
    expect(approve.textContent).toContain('$ approve')
    expect(reject.textContent).toContain('$ reject')
    expect(adjust.textContent).toContain('$ adjust')
    expect(regenerate.textContent).toContain('$ regenerate')
  })

  it('copies generated content and datasource to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(globalThis.navigator, {
      clipboard: { writeText },
    })

    const { fixture } = await createFixture()

    getButtonByText(fixture, '$ copy generated').click()
    await settleFixture(fixture)

    expect(writeText).toHaveBeenNthCalledWith(
      1,
      '## o que foi feito\n- implemented retry logic',
    )
    expect(toastMock.success).toHaveBeenNthCalledWith(
      1,
      'generated content copied',
    )

    getButtonByText(fixture, '$ copy datasource').click()
    await settleFixture(fixture)

    expect(writeText).toHaveBeenNthCalledWith(2, '{\n  "repos": []\n}')
    expect(toastMock.success).toHaveBeenNthCalledWith(2, 'datasource copied')
  })

  it('expands and collapses the datasource card on demand', async () => {
    const sourceData = [
      '{',
      '  "repos": [',
      '    {',
      '      "repoName": "standup-service",',
      '      "commits": [',
      '        { "hash": "abc1234" },',
      '        { "hash": "def5678" },',
      '        { "hash": "ghi9012" }',
      '      ]',
      '    }',
      '  ]',
      '}',
    ].join('\n')

    const { fixture, standupResource } = await createFixture()
    standupResource.value.set(createStandupDetail({ sourceData }))
    fixture.detectChanges()

    const element = fixture.nativeElement as HTMLElement

    expect(element.textContent).toContain('$ expand')
    expect(element.textContent).toContain('preview')
    expect(element.textContent).toContain('12 lines')
    expect(element.textContent).toContain('...')

    getButtonByText(fixture, '$ expand').click()
    fixture.detectChanges()

    expect(element.textContent).toContain('$ collapse')
    expect(element.textContent).toContain('full json')
    expect(element.textContent).toContain('"hash": "ghi9012"')
  })

  it('hides all action buttons when the standup is approved', async () => {
    const { fixture } = await createFixture({ status: 'approved' })
    const buttons = getActionButtons(fixture)

    expect(buttons.approve).toBeUndefined()
    expect(buttons.reject).toBeUndefined()
    expect(buttons.adjust).toBeUndefined()
    expect(buttons.regenerate).toBeUndefined()
  })

  it('shows only regenerate when the standup is rejected', async () => {
    const { fixture } = await createFixture({ status: 'rejected' })
    const buttons = getActionButtons(fixture)

    expect(buttons.approve).toBeUndefined()
    expect(buttons.reject).toBeUndefined()
    expect(buttons.adjust).toBeUndefined()
    expect(buttons.regenerate.textContent).toContain('$ regenerate')
  })

  it('opens the approve dialog when the approve button is clicked', async () => {
    const { fixture, dialogService } = await createFixture()

    getActionButtons(fixture).approve.click()
    fixture.detectChanges()

    expect(dialogService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        zTitle: '// aprovar standup',
        zDescription:
          '// opcionalmente adicione reunioes extras e calls diretas',
        zHideFooter: true,
      }),
    )
  })

  it('calls approve with custom entries when the approve dialog submits', async () => {
    const { fixture, dialogService, standupService, standupResource } =
      await createFixture()
    const standupId = standupResource.value()?.id ?? STANDUP_ID

    getActionButtons(fixture).approve.click()
    fixture.detectChanges()

    const config = dialogService.create.mock.calls[0]?.[0] as {
      zData: {
        onSubmit(payload: {
          customEntries: {
            scheduledMeetings: string[]
            directCalls: string[]
          } | null
        }): void
      }
    }

    config.zData.onSubmit({
      customEntries: {
        scheduledMeetings: ['Planning Backend'],
        directCalls: ['Call com Joao'],
      },
    })
    await settleFixture(fixture)

    expect(standupService.approve).toHaveBeenCalledWith(standupId, {
      scheduledMeetings: ['Planning Backend'],
      directCalls: ['Call com Joao'],
    })
    expect(standupResource.reload).toHaveBeenCalledOnce()
    expect(toastMock.success).toHaveBeenCalledWith('Standup aprovado')
  })

  it('shows warning toast returned by approve flow', async () => {
    const { fixture, dialogService } = await createFixture({
      approve: async () => ({
        standup: createStandupDetail(),
        warning: 'Standup aprovado, mas a publicacao falhou',
      }),
    })

    getActionButtons(fixture).approve.click()
    fixture.detectChanges()

    const config = dialogService.create.mock.calls[0]?.[0] as {
      zData: { onSubmit(payload: { customEntries: null }): void }
    }

    config.zData.onSubmit({ customEntries: null })
    await settleFixture(fixture)

    expect(toastMock.success).toHaveBeenCalledWith(
      'Standup aprovado, mas a publicacao falhou',
    )
  })

  it('opens the adjust modal when the adjust button is clicked', async () => {
    const { fixture, dialogService } = await createFixture()

    getActionButtons(fixture).adjust.click()
    fixture.detectChanges()

    expect(dialogService.create).toHaveBeenCalledOnce()
    expect(dialogService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        zTitle: '// adjust standup',
        zDescription: '// rewrite instructions',
        zHideFooter: true,
      }),
    )
  })

  it('calls adjust with the standup id and instruction when the dialog submits', async () => {
    const { fixture, dialogService, standupService, standupResource } =
      await createFixture()
    const standupId = standupResource.value()?.id ?? STANDUP_ID

    getActionButtons(fixture).adjust.click()
    fixture.detectChanges()

    const config = dialogService.create.mock.calls[0]?.[0] as {
      zData: { onSubmit(instruction: string): void }
    }
    config.zData.onSubmit('tighten the summary')
    await settleFixture(fixture)

    expect(standupService.adjust).toHaveBeenCalledWith(
      standupId,
      'tighten the summary',
    )
    // fire-and-forget: no reload here — SSE event triggers selectedStandup.reload()
    expect(standupResource.reload).not.toHaveBeenCalled()
    expect(toastMock.success).toHaveBeenCalledWith('Solicitação aceita')
  })

  it('disables all action buttons while an action is in flight', async () => {
    const rejectDeferred = createDeferred<void>()
    const { fixture, standupService, standupResource } = await createFixture({
      reject: () => rejectDeferred.promise,
    })

    const { approve, reject, adjust, regenerate } = getActionButtons(fixture)

    reject.click()
    fixture.detectChanges()

    expect(standupService.reject).toHaveBeenCalledWith(STANDUP_ID)
    expect(approve.disabled).toBe(true)
    expect(reject.disabled).toBe(true)
    expect(adjust.disabled).toBe(true)
    expect(regenerate.disabled).toBe(true)

    rejectDeferred.resolve()
    await settleFixture(fixture)

    expect(standupResource.reload).toHaveBeenCalledOnce()
    expect(approve.disabled).toBe(false)
    expect(reject.disabled).toBe(false)
    expect(adjust.disabled).toBe(false)
    expect(regenerate.disabled).toBe(false)
  })

  it('opens the regenerate confirmation modal when the regenerate button is clicked', async () => {
    const { fixture, dialogService } = await createFixture()

    getActionButtons(fixture).regenerate.click()
    fixture.detectChanges()

    expect(dialogService.create).toHaveBeenCalledOnce()
    expect(dialogService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        zTitle: '// regenerar standup',
        zOkDestructive: true,
        zOkText: '$ confirmar',
        zCancelText: '$ cancelar',
      }),
    )
  })

  it('calls regenerate and shows toast when confirmation modal is confirmed', async () => {
    const { fixture, dialogService, standupService, standupResource } =
      await createFixture()

    getActionButtons(fixture).regenerate.click()
    fixture.detectChanges()

    const config = dialogService.create.mock.calls[0]?.[0] as {
      zOnOk(): void
    }
    config.zOnOk()
    await settleFixture(fixture)

    expect(standupService.regenerate).toHaveBeenCalledWith(STANDUP_ID)
    // fire-and-forget: no reload here — SSE event triggers selectedStandup.reload()
    expect(standupResource.reload).not.toHaveBeenCalled()
    expect(toastMock.success).toHaveBeenCalledWith('Solicitação aceita')
  })

  it('does not call regenerate when the confirmation modal is dismissed', async () => {
    const { fixture, dialogService, standupService } = await createFixture()

    getActionButtons(fixture).regenerate.click()
    fixture.detectChanges()

    expect(dialogService.create).toHaveBeenCalledOnce()
    expect(standupService.regenerate).not.toHaveBeenCalled()
  })

  it('shows a toast after reject action', async () => {
    const { fixture } = await createFixture()

    getActionButtons(fixture).reject.click()
    await settleFixture(fixture)

    expect(toastMock.success).toHaveBeenCalledWith('Standup rejeitado')
  })
})
