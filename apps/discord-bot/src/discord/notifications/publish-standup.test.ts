import { ExternalServiceError, Result } from '@standup/domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// vi.hoisted
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  sendChannelNotification: vi.fn(),
  buildPublishedEmbed: vi.fn().mockReturnValue({
    title: 'Standup — 2026-03-04',
    color: 0x2ecc71,
    description: '## Standup\n\n- feat: add feature',
  }),
}))

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('./send-channel-notification.js', () => ({
  sendChannelNotification: mocks.sendChannelNotification,
}))

vi.mock('../embeds.js', () => ({
  buildPublishedEmbed: mocks.buildPublishedEmbed,
}))

// ---------------------------------------------------------------------------
// Import após mocks
// ---------------------------------------------------------------------------

import type { Client } from 'discord.js'
import { publishStandup } from './publish-standup.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CHANNEL_ID = 'channel-123'

const standupRecord = {
  id: 'standup-abc',
  date: '2026-03-04',
  meetingType: 'daily',
  content: '## Standup\n\n- feat: add feature',
  sourceData: '{}',
  status: 'approved' as const,
  createdAt: 1000,
  updatedAt: 1000,
}

const fakeClient = {} as unknown as Client

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('publishStandup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.buildPublishedEmbed.mockReturnValue({
      title: 'Standup — 2026-03-04',
      color: 0x2ecc71,
      description: '## Standup\n\n- feat: add feature',
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('constrói embed verde e delega envio ao sendChannelNotification', async () => {
    mocks.sendChannelNotification.mockResolvedValue(Result.ok(undefined))

    const result = await publishStandup(standupRecord, fakeClient, CHANNEL_ID)

    expect(result.status).toBe('ok')
    expect(mocks.buildPublishedEmbed).toHaveBeenCalledWith(standupRecord)
    expect(mocks.sendChannelNotification).toHaveBeenCalledTimes(1)
    const args = mocks.sendChannelNotification.mock.calls[0] as [
      Client,
      string,
      { color: number },
      Array<{ toJSON: () => { components: Array<{ custom_id?: string }> } }>,
    ]
    expect(args[0]).toBe(fakeClient)
    expect(args[1]).toBe(CHANNEL_ID)
    expect(args[2]).toEqual(expect.objectContaining({ color: 0x2ecc71 }))
    expect(args[3]).toHaveLength(1)
    const rowJson = args[3][0]?.toJSON()
    expect(rowJson?.components[0]?.custom_id).toBe(
      'standup-copy:content:standup-abc',
    )
  })

  it('retorna ExternalServiceError quando sendChannelNotification falha', async () => {
    mocks.sendChannelNotification.mockResolvedValue(
      Result.err(
        new ExternalServiceError({
          service: 'discord',
          message: 'Channel not found',
        }),
      ),
    )

    const result = await publishStandup(standupRecord, fakeClient, CHANNEL_ID)

    expect(result.status).toBe('error')
    if (result.isErr()) {
      expect(ExternalServiceError.is(result.error)).toBe(true)
      expect(result.error.message).toMatch(/channel/i)
    }
  })

  it('propaga o erro de canal não-enviável', async () => {
    mocks.sendChannelNotification.mockResolvedValue(
      Result.err(
        new ExternalServiceError({
          service: 'discord',
          message: 'Channel channel-123 is not a sendable text channel',
        }),
      ),
    )

    const result = await publishStandup(standupRecord, fakeClient, CHANNEL_ID)

    expect(result.status).toBe('error')
    if (result.isErr()) {
      expect(result.error.message).toMatch(/sendable/i)
    }
  })

  it('propaga ExternalServiceError quando sendChannelNotification lança', async () => {
    mocks.sendChannelNotification.mockResolvedValue(
      Result.err(
        new ExternalServiceError({
          service: 'discord',
          message: 'Failed to send channel notification: Discord API error',
        }),
      ),
    )

    const result = await publishStandup(standupRecord, fakeClient, CHANNEL_ID)

    expect(result.status).toBe('error')
    if (result.isErr()) {
      expect(result.error.message).toMatch(/Discord API error/i)
    }
  })
})
