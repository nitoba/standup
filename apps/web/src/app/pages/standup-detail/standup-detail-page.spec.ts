import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { toastMock } = vi.hoisted(() => ({
  toastMock: vi.fn(),
}))

vi.mock('ngx-sonner', () => ({
  toast: toastMock,
}))

import { StandupService } from '../../services/standup.service'
import { ZardDialogService } from '../../shared/components/dialog'
import type { Standup, StandupStatus } from '../../types/standup'
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
  approve?: () => Promise<unknown>
  reject?: () => Promise<unknown>
  adjust?: (id: string, instruction: string) => Promise<unknown>
  regenerate?: () => Promise<unknown>
  reload?: () => Promise<void>
}) {
  const detail = signal<Standup | undefined>(
    createStandupDetail({ status: options?.status }),
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
    approve: vi.fn(options?.approve ?? (async () => {})),
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
    toastMock.mockReset()
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
    expect(element.textContent).toContain('$ expand datasource')
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
    expect(toastMock).toHaveBeenNthCalledWith(1, 'generated content copied')

    getButtonByText(fixture, '$ copy datasource').click()
    await settleFixture(fixture)

    expect(writeText).toHaveBeenNthCalledWith(2, '{\n  "repos": []\n}')
    expect(toastMock).toHaveBeenNthCalledWith(2, 'datasource copied')
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

    expect(element.textContent).toContain('$ expand datasource')
    expect(element.textContent).toContain('preview')
    expect(element.textContent).toContain('12 lines')
    expect(element.textContent).toContain('...')

    getButtonByText(fixture, '$ expand datasource').click()
    fixture.detectChanges()

    expect(element.textContent).toContain('$ collapse datasource')
    expect(element.textContent).toContain('full json')
    expect(element.textContent).toContain('"hash": "ghi9012"')
  })

  it('hides approve, reject and adjust when the standup is approved', async () => {
    const { fixture } = await createFixture({ status: 'approved' })
    const buttons = getActionButtons(fixture)

    expect(buttons.approve).toBeUndefined()
    expect(buttons.reject).toBeUndefined()
    expect(buttons.adjust).toBeUndefined()
    expect(buttons.regenerate.textContent).toContain('$ regenerate')
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
    expect(standupResource.reload).toHaveBeenCalledOnce()
    expect(toastMock).toHaveBeenCalledWith('Ajuste enviado para regeneracao')
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

  it('shows a toast after regenerate', async () => {
    const { fixture } = await createFixture()

    getActionButtons(fixture).regenerate.click()
    await settleFixture(fixture)

    expect(toastMock).toHaveBeenCalledWith('Standup enviado para regeneracao')
  })

  it('shows a toast after approve and reject actions', async () => {
    const { fixture, standupService, standupResource } = await createFixture()

    getActionButtons(fixture).approve.click()
    await settleFixture(fixture)

    expect(toastMock).toHaveBeenCalledWith('Standup aprovado')

    toastMock.mockReset()
    standupService.approve.mockClear()
    standupService.reject.mockClear()
    standupResource.reload.mockClear()

    getActionButtons(fixture).reject.click()
    await settleFixture(fixture)

    expect(toastMock).toHaveBeenCalledWith('Standup rejeitado')
  })
})
