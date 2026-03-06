import { ExternalServiceError } from '@standup/domain'
import type { Client, Message, User } from 'discord.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendReminderDm } from './send-reminder-dm.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NEXT_RUN_AT = '2026-03-06T17:30:00.000Z'
const DISCORD_USER_ID = 'user-123'
const WORKER_INTERNAL_URL = 'http://localhost:3335'
const INTERNAL_SECRET = 'test-secret'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMessage(id = 'msg-456'): Message {
  return { id } as unknown as Message
}

function makeUser(sendResult: Message | Error): User {
  const send = vi.fn()
  if (sendResult instanceof Error) {
    send.mockRejectedValue(sendResult)
  } else {
    send.mockResolvedValue(sendResult)
  }
  return { send } as unknown as User
}

function makeClient(user: User): Client {
  const fetch = vi.fn().mockResolvedValue(user)
  return { users: { fetch } } as unknown as Client
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sendReminderDm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('envia DM com embed âmbar e 3 botões e retorna messageId', async () => {
    const message = makeMessage('msg-456')
    const user = makeUser(message)
    const client = makeClient(user)

    const result = await sendReminderDm(NEXT_RUN_AT, {
      client,
      discordUserId: DISCORD_USER_ID,
      workerInternalUrl: WORKER_INTERNAL_URL,
      internalSecret: INTERNAL_SECRET,
    })

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.messageId).toBe('msg-456')
    }

    expect(client.users.fetch as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      DISCORD_USER_ID,
    )

    const sendMock = (user as unknown as { send: ReturnType<typeof vi.fn> })
      .send
    expect(sendMock).toHaveBeenCalledOnce()

    const callArgs = sendMock.mock.calls[0]?.[0] as {
      embeds: Array<{ title: string; color: number }>
      components: unknown[]
    }
    expect(callArgs).toBeDefined()

    // Padrão 3: embed âmbar (WARNING)
    expect(callArgs.embeds).toHaveLength(1)
    const embed = callArgs.embeds[0]
    expect(embed?.color).toBe(0xf39c12) // âmbar = WARNING
    expect(embed?.title).toContain('Lembrete')

    // 1 ActionRow com 3 botões
    expect(callArgs.components).toHaveLength(1)
  })

  it('inclui botões com customIds corretos (standup-reminder:*)', async () => {
    const message = makeMessage()
    const user = makeUser(message)
    const client = makeClient(user)

    await sendReminderDm(NEXT_RUN_AT, {
      client,
      discordUserId: DISCORD_USER_ID,
      workerInternalUrl: WORKER_INTERNAL_URL,
      internalSecret: INTERNAL_SECRET,
    })

    const sendMock = (user as unknown as { send: ReturnType<typeof vi.fn> })
      .send
    const callArgs = sendMock.mock.calls[0]?.[0] as {
      components: Array<{ components: Array<{ data: { custom_id: string } }> }>
    }
    expect(callArgs).toBeDefined()

    const buttons = callArgs.components[0]?.components ?? []
    const customIds = buttons.map((b) => b.data.custom_id)

    expect(customIds).toContain('standup-reminder:run-now')
    expect(customIds).toContain('standup-reminder:snooze')
    expect(customIds).toContain('standup-reminder:cancel-today')
  })

  it('retorna ExternalServiceError quando users.fetch falha', async () => {
    const client = {
      users: {
        fetch: vi.fn().mockRejectedValue(new Error('User not found')),
      },
    } as unknown as Client

    const result = await sendReminderDm(NEXT_RUN_AT, {
      client,
      discordUserId: DISCORD_USER_ID,
      workerInternalUrl: WORKER_INTERNAL_URL,
      internalSecret: INTERNAL_SECRET,
    })

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(ExternalServiceError.is(result.error)).toBe(true)
      expect(result.error.message).toContain('User not found')
    }
  })

  it('retorna ExternalServiceError quando user.send falha', async () => {
    const user = makeUser(new Error('DM blocked'))
    const client = makeClient(user)

    const result = await sendReminderDm(NEXT_RUN_AT, {
      client,
      discordUserId: DISCORD_USER_ID,
      workerInternalUrl: WORKER_INTERNAL_URL,
      internalSecret: INTERNAL_SECRET,
    })

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(ExternalServiceError.is(result.error)).toBe(true)
      expect(result.error.message).toContain('DM blocked')
    }
  })
})
