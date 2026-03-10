import { ExternalServiceError } from '@standup/domain'
import type { Client, Message, User } from 'discord.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendReviewDm } from './send-review-dm.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const standupRecord = {
  id: 'standup-abc',
  date: '2026-03-04',
  meetingType: 'daily',
  content: '## Standup\n\n- feat: add feature',
  sourceData: '{}',
  customEntries: null,
  userId: 'test-user-1',
  status: 'draft' as const,
  createdAt: 1000,
  dmMessageId: null,
  updatedAt: 1000,
}

const DISCORD_USER_ID = 'user-123'

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

describe('sendReviewDm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('envia DM com botões e retorna messageId quando tudo está correto', async () => {
    const message = makeMessage('msg-456')
    const user = makeUser(message)
    const client = makeClient(user)

    const result = await sendReviewDm(standupRecord, {
      client,
      discordUserId: DISCORD_USER_ID,
    })

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.messageId).toBe('msg-456')
    }

    // Verifica que fetch foi chamado com o userId correto
    expect(client.users.fetch as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      DISCORD_USER_ID,
    )

    // Verifica que a mensagem enviada contém data e conteúdo do standup
    const sendMock = (user as unknown as { send: ReturnType<typeof vi.fn> })
      .send
    expect(sendMock).toHaveBeenCalledOnce()
    const callArgs = sendMock.mock.calls[0]?.[0] as {
      embeds: Array<{ title: string; description: string; color: number }>
      components: unknown[]
    }
    expect(callArgs).toBeDefined()
    // Padrão 3: deve enviar embed azul (não content puro)
    expect(callArgs.embeds).toHaveLength(1)
    const embed = callArgs.embeds[0]
    expect(embed?.title).toContain(standupRecord.date)
    expect(embed?.description).toContain(standupRecord.content)
    expect(embed?.color).toBe(0x3498db) // azul = REVIEW
    expect(callArgs.components).toHaveLength(1) // 1 ActionRow
  })

  it('inclui botões Aprovar, Rejeitar, Ajustar texto e Regenerar do zero com customIds corretos', async () => {
    const message = makeMessage()
    const user = makeUser(message)
    const client = makeClient(user)

    await sendReviewDm(standupRecord, {
      client,
      discordUserId: DISCORD_USER_ID,
    })

    const sendMock = (user as unknown as { send: ReturnType<typeof vi.fn> })
      .send
    const callArgs = sendMock.mock.calls[0]?.[0] as {
      content: string
      components: Array<{ components: Array<{ data: { custom_id: string } }> }>
    }
    expect(callArgs).toBeDefined()

    // Extrair customIds dos botões
    const buttons = callArgs.components[0]?.components ?? []
    const customIds = buttons.map((b) => b.data.custom_id)

    expect(customIds).toContain(`standup:approve:${standupRecord.id}`)
    expect(customIds).toContain(`standup:reject:${standupRecord.id}`)
    expect(customIds).toContain(`standup:adjust:${standupRecord.id}`)
    expect(customIds).toContain(`standup:regenerate:${standupRecord.id}`)
  })

  it('retorna ExternalServiceError quando users.fetch falha', async () => {
    const client = {
      users: {
        fetch: vi.fn().mockRejectedValue(new Error('User not found')),
      },
    } as unknown as Client

    const result = await sendReviewDm(standupRecord, {
      client,
      discordUserId: DISCORD_USER_ID,
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

    const result = await sendReviewDm(standupRecord, {
      client,
      discordUserId: DISCORD_USER_ID,
    })

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(ExternalServiceError.is(result.error)).toBe(true)
      expect(result.error.message).toContain('DM blocked')
    }
  })
})
