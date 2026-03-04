import { ExternalServiceError } from '@standup/domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeChannel(overrides: Record<string, unknown> = {}) {
  const channelSend = vi.fn()
  return {
    channel: {
      isTextBased: () => true,
      isSendable: () => true,
      send: channelSend,
      ...overrides,
    },
    channelSend,
  }
}

function makeClient(channelResult: unknown) {
  const fetchChannel = vi.fn().mockResolvedValue(channelResult)
  return {
    client: {
      channels: { fetch: fetchChannel },
    } as unknown as import('discord.js').Client,
    fetchChannel,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('publishStandup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('publica standup no canal e retorna ok', async () => {
    const { channel, channelSend } = makeChannel()
    const { client, fetchChannel } = makeClient(channel)

    const result = await publishStandup(standupRecord, client, CHANNEL_ID)

    expect(result.status).toBe('ok')
    expect(fetchChannel).toHaveBeenCalledWith(CHANNEL_ID)
    expect(channelSend).toHaveBeenCalledOnce()
    // Mensagem deve conter a data e o conteúdo
    const [sentArg] = channelSend.mock.lastCall as [{ content: string }]
    expect(sentArg.content).toContain('2026-03-04')
    expect(sentArg.content).toContain('## Standup')
  })

  it('retorna ExternalServiceError quando canal não é encontrado (fetch retorna null)', async () => {
    const { client } = makeClient(null)

    const result = await publishStandup(standupRecord, client, CHANNEL_ID)

    expect(result.status).toBe('error')
    if (result.isErr()) {
      expect(ExternalServiceError.is(result.error)).toBe(true)
      expect(result.error.message).toMatch(/channel/i)
    }
  })

  it('retorna ExternalServiceError quando canal não é baseado em texto', async () => {
    const { channel } = makeChannel({
      isTextBased: () => false,
      isSendable: () => false,
    })
    const { client } = makeClient(channel)

    const result = await publishStandup(standupRecord, client, CHANNEL_ID)

    expect(result.status).toBe('error')
    if (result.isErr()) {
      expect(ExternalServiceError.is(result.error)).toBe(true)
    }
  })

  it('retorna ExternalServiceError quando send lança exceção', async () => {
    const { channel } = makeChannel({
      send: vi.fn().mockRejectedValue(new Error('Discord API error')),
    })
    const { client } = makeClient(channel)

    const result = await publishStandup(standupRecord, client, CHANNEL_ID)

    expect(result.status).toBe('error')
    if (result.isErr()) {
      expect(ExternalServiceError.is(result.error)).toBe(true)
      expect(result.error.message).toMatch(/Discord API error/i)
    }
  })
})
