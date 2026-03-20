import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StandupRecord, StandupStatus } from '../../../shared/domain'
import { NotFoundError, Result } from '../../../shared/domain'
import { SendToDiscordService } from './send-to-discord.service'

const USER_ID = 'user-1'
const STANDUP_ID = 'standup-1'

function makeStandupRecord(overrides: Partial<StandupRecord> = {}): StandupRecord {
  return {
    id: STANDUP_ID,
    date: '2026-03-20',
    meetingType: 'standup',
    content: '## Standup content',
    sourceData: '{}',
    customEntries: null,
    status: 'approved' as StandupStatus,
    userId: USER_ID,
    dmMessageId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    sentToDiscordAt: null,
    ...overrides,
  }
}

function makeAutomationConfig(overrides: Record<string, unknown> = {}) {
  return {
    url: 'http://localhost:9000',
    channelUrl: 'https://discord.com/channels/123/456',
    webhookSecret: 'test-secret',
    sendTimeoutMs: 5000,
    ...overrides,
  }
}

function createService(deps: {
  standupRepository: Record<string, unknown>
  envService: Record<string, unknown>
  localDateService: Record<string, unknown>
  userSettingsRepository: Record<string, unknown>
}) {
  return new SendToDiscordService(
    deps.standupRepository as never,
    deps.envService as never,
    deps.localDateService as never,
    deps.userSettingsRepository as never,
  )
}

describe('SendToDiscordService', () => {
  let standupRepository: {
    findByIdForUser: ReturnType<typeof vi.fn>
    updateSentToDiscordAt: ReturnType<typeof vi.fn>
  }
  let envService: { automation: ReturnType<typeof makeAutomationConfig> }
  let localDateService: { formatIsoForTimezone: ReturnType<typeof vi.fn> }
  let userSettingsRepository: { findByUserId: ReturnType<typeof vi.fn> }
  let service: SendToDiscordService

  beforeEach(() => {
    standupRepository = {
      findByIdForUser: vi.fn(),
      updateSentToDiscordAt: vi.fn(),
    }

    envService = {
      automation: makeAutomationConfig(),
    }

    localDateService = {
      formatIsoForTimezone: vi.fn().mockReturnValue('2026-03-20'),
    }

    userSettingsRepository = {
      findByUserId: vi.fn().mockResolvedValue(Result.ok(null)),
    }

    service = createService({
      standupRepository,
      envService,
      localDateService,
      userSettingsRepository,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('throws NotFoundException when standup not found', async () => {
    standupRepository.findByIdForUser.mockResolvedValue(
      Result.err(new NotFoundError({ resource: 'standup', id: STANDUP_ID })),
    )

    await expect(service.send(USER_ID, STANDUP_ID)).rejects.toThrow(NotFoundException)
  })

  it('throws ConflictException when status is draft', async () => {
    standupRepository.findByIdForUser.mockResolvedValue(
      Result.ok(makeStandupRecord({ status: 'draft' })),
    )

    await expect(service.send(USER_ID, STANDUP_ID)).rejects.toThrow(ConflictException)
  })

  it('throws ConflictException when status is pending_review', async () => {
    standupRepository.findByIdForUser.mockResolvedValue(
      Result.ok(makeStandupRecord({ status: 'pending_review' })),
    )

    await expect(service.send(USER_ID, STANDUP_ID)).rejects.toThrow(ConflictException)
  })

  it('throws ConflictException when status is rejected', async () => {
    standupRepository.findByIdForUser.mockResolvedValue(
      Result.ok(makeStandupRecord({ status: 'rejected' })),
    )

    await expect(service.send(USER_ID, STANDUP_ID)).rejects.toThrow(ConflictException)
  })

  it('throws ServiceUnavailableException when automation URL is not configured', async () => {
    standupRepository.findByIdForUser.mockResolvedValue(
      Result.ok(makeStandupRecord()),
    )
    envService.automation = makeAutomationConfig({ url: '' })

    await expect(service.send(USER_ID, STANDUP_ID)).rejects.toThrow(
      ServiceUnavailableException,
    )
  })

  it('throws ServiceUnavailableException when fetch fails (network error)', async () => {
    standupRepository.findByIdForUser.mockResolvedValue(
      Result.ok(makeStandupRecord()),
    )

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new TypeError('fetch failed'),
    )

    await expect(service.send(USER_ID, STANDUP_ID)).rejects.toThrow(
      ServiceUnavailableException,
    )
  })

  it('throws ServiceUnavailableException when fetch times out', async () => {
    standupRepository.findByIdForUser.mockResolvedValue(
      Result.ok(makeStandupRecord()),
    )

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new DOMException('The operation was aborted', 'AbortError'),
    )

    await expect(service.send(USER_ID, STANDUP_ID)).rejects.toThrow(
      ServiceUnavailableException,
    )
  })

  it('throws ServiceUnavailableException when automation server returns non-200', async () => {
    standupRepository.findByIdForUser.mockResolvedValue(
      Result.ok(makeStandupRecord()),
    )

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Bad Request', { status: 400 }),
    )

    await expect(service.send(USER_ID, STANDUP_ID)).rejects.toThrow(
      ServiceUnavailableException,
    )
  })

  it('updates sentToDiscordAt and returns formatted record on success', async () => {
    const record = makeStandupRecord()
    const updatedRecord = { ...record, sentToDiscordAt: Date.now() }

    standupRepository.findByIdForUser.mockResolvedValue(Result.ok(record))
    standupRepository.updateSentToDiscordAt.mockResolvedValue(
      Result.ok(updatedRecord),
    )

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('OK', { status: 200 }),
    )

    const result = await service.send(USER_ID, STANDUP_ID)

    expect(result).toEqual({
      ...updatedRecord,
      date: '2026-03-20',
    })
    expect(standupRepository.updateSentToDiscordAt).toHaveBeenCalledWith(STANDUP_ID)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:9000/send',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'x-webhook-signature': expect.any(String),
        }),
      }),
    )
  })

  it('works for published standups', async () => {
    const record = makeStandupRecord({ status: 'published' })
    const updatedRecord = { ...record, sentToDiscordAt: Date.now() }

    standupRepository.findByIdForUser.mockResolvedValue(Result.ok(record))
    standupRepository.updateSentToDiscordAt.mockResolvedValue(
      Result.ok(updatedRecord),
    )

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('OK', { status: 200 }),
    )

    const result = await service.send(USER_ID, STANDUP_ID)

    expect(result.sentToDiscordAt).not.toBeNull()
  })

  it('allows re-send (updates sentToDiscordAt again)', async () => {
    const record = makeStandupRecord({ sentToDiscordAt: Date.now() - 60_000 })
    const newTimestamp = Date.now()
    const updatedRecord = { ...record, sentToDiscordAt: newTimestamp }

    standupRepository.findByIdForUser.mockResolvedValue(Result.ok(record))
    standupRepository.updateSentToDiscordAt.mockResolvedValue(
      Result.ok(updatedRecord),
    )

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('OK', { status: 200 }),
    )

    const result = await service.send(USER_ID, STANDUP_ID)

    expect(result.sentToDiscordAt).toBe(newTimestamp)
    expect(standupRepository.updateSentToDiscordAt).toHaveBeenCalledWith(STANDUP_ID)
  })
})
