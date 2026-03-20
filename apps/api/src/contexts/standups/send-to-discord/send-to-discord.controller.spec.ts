import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SendToDiscordController } from './send-to-discord.controller'
import type { SendToDiscordService } from './send-to-discord.service'

const USER_ID = 'user-1'
const STANDUP_ID = '550e8400-e29b-41d4-a716-446655440000'

const MOCK_RECORD = {
  id: STANDUP_ID,
  date: '2026-03-20',
  meetingType: 'standup',
  content: '## Standup content',
  sourceData: '{}',
  customEntries: null,
  status: 'approved',
  userId: USER_ID,
  dmMessageId: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  sentToDiscordAt: Date.now(),
}

function makeSession(userId = USER_ID) {
  return { user: { id: userId } }
}

describe('SendToDiscordController', () => {
  let controller: SendToDiscordController
  let service: { send: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    service = { send: vi.fn() }
    controller = new SendToDiscordController(
      service as unknown as SendToDiscordService,
    )
  })

  it('returns 200 with { data: record } on success', async () => {
    service.send.mockResolvedValue(MOCK_RECORD)

    const result = await controller.send(makeSession(), STANDUP_ID)

    expect(result).toEqual({ data: MOCK_RECORD })
    expect(service.send).toHaveBeenCalledWith(USER_ID, STANDUP_ID)
  })

  it('propagates NotFoundException from service', async () => {
    service.send.mockRejectedValue(new NotFoundException('Standup not found'))

    await expect(controller.send(makeSession(), STANDUP_ID)).rejects.toThrow(
      NotFoundException,
    )
  })

  it('propagates ConflictException from service', async () => {
    service.send.mockRejectedValue(
      new ConflictException('Invalid state transition'),
    )

    await expect(controller.send(makeSession(), STANDUP_ID)).rejects.toThrow(
      ConflictException,
    )
  })

  it('propagates ServiceUnavailableException from service', async () => {
    service.send.mockRejectedValue(
      new ServiceUnavailableException('Discord automation not configured'),
    )

    await expect(controller.send(makeSession(), STANDUP_ID)).rejects.toThrow(
      ServiceUnavailableException,
    )
  })
})
