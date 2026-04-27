import { describe, expect, it, vi } from 'vitest'
import {
  ExternalServiceError,
  Result,
  type StandupRecord,
} from '../../../shared/domain'
import { SendToDiscordService } from './send-to-discord.service'

const approvedStandup: StandupRecord = {
  id: 'standup-1',
  date: '2026-03-09',
  meetingType: 'daily',
  content: 'standup aprovado',
  sourceData: '{}',
  customEntries: null,
  status: 'approved',
  userId: 'user-1',
  dmMessageId: null,
  createdAt: 1,
  updatedAt: 1,
  sentToDiscordAt: null,
}

function makeService(overrides?: {
  standup?: StandupRecord
  channelId?: string
  publishResult?: Result<void, ExternalServiceError>
}) {
  const standup = overrides?.standup ?? approvedStandup
  const marked = {
    ...standup,
    sentToDiscordAt: 2,
    updatedAt: 2,
  }
  const read = {
    findByIdForUser: vi.fn().mockResolvedValue(Result.ok(standup)),
  }
  const write = {
    updateSentToDiscordAt: vi.fn().mockResolvedValue(Result.ok(marked)),
  }
  const messages = {
    publishStandup: vi
      .fn()
      .mockResolvedValue(overrides?.publishResult ?? Result.ok(undefined)),
  }
  const env = {
    discord: {
      channelId: overrides?.channelId ?? 'discord-channel-1',
    },
  }
  const localDateService = {
    formatIsoForTimezone: vi.fn((date: string) => `formatted:${date}`),
  }
  const userTimezone = {
    resolve: vi.fn().mockResolvedValue('America/Sao_Paulo'),
  }

  const service = new SendToDiscordService(
    read as never,
    write as never,
    messages as never,
    env as never,
    localDateService as never,
    userTimezone as never,
  )

  return { service, read, write, messages, localDateService }
}

describe('SendToDiscordService', () => {
  it('publishes approved standups and marks them as sent', async () => {
    const { service, read, write, messages, localDateService } = makeService()

    const result = await service.send('user-1', 'standup-1')

    expect(read.findByIdForUser).toHaveBeenCalledWith('standup-1', 'user-1')
    expect(messages.publishStandup).toHaveBeenCalledWith(
      approvedStandup,
      'discord-channel-1',
    )
    expect(write.updateSentToDiscordAt).toHaveBeenCalledWith('standup-1')
    expect(localDateService.formatIsoForTimezone).toHaveBeenCalledWith(
      '2026-03-09',
      'America/Sao_Paulo',
    )
    expect(result.sentToDiscordAt).toBe(2)
    expect(result.date).toBe('formatted:2026-03-09')
  })

  it('rejects standups that are not approved', async () => {
    const { service, messages } = makeService({
      standup: { ...approvedStandup, status: 'pending_review' },
    })

    await expect(service.send('user-1', 'standup-1')).rejects.toMatchObject({
      field: 'status',
    })
    expect(messages.publishStandup).not.toHaveBeenCalled()
  })

  it('requires a configured Discord channel', async () => {
    const { service, messages } = makeService({ channelId: '' })

    await expect(service.send('user-1', 'standup-1')).rejects.toMatchObject({
      service: 'discord',
    })
    expect(messages.publishStandup).not.toHaveBeenCalled()
  })
})
