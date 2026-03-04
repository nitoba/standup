import { Result } from '@standup/domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handleStandupInteraction: vi.fn(),
  loggerInfo: vi.fn(),
  loggerError: vi.fn(),
  withContextInfo: vi.fn(),
  withContextError: vi.fn(),
}))

vi.mock('@standup/logger', () => ({
  createServiceLogger: vi.fn().mockReturnValue({
    info: mocks.loggerInfo,
    error: mocks.loggerError,
  }),
  withContext: vi.fn().mockReturnValue({
    info: mocks.withContextInfo,
    error: mocks.withContextError,
  }),
}))

vi.mock('./interaction-handler.js', () => ({
  handleStandupInteraction: mocks.handleStandupInteraction,
}))

import type { ButtonInteraction, Client } from 'discord.js'
import { handleButtonInteraction } from './button-handler.js'

function makeInteraction(customId: string): {
  interaction: ButtonInteraction
  deferUpdate: ReturnType<typeof vi.fn>
  editReply: ReturnType<typeof vi.fn>
} {
  const deferUpdate = vi.fn().mockResolvedValue(undefined)
  const editReply = vi.fn().mockResolvedValue(undefined)

  return {
    interaction: {
      customId,
      user: { id: 'user-123' },
      deferUpdate,
      editReply,
    } as unknown as ButtonInteraction,
    deferUpdate,
    editReply,
  }
}

const fakeClient = {} as unknown as Client
const env = {
  DATABASE_URL: ':memory:',
  DISCORD_CHANNEL_ID: 'channel-123',
}

describe('handleButtonInteraction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('ignora botão fora do namespace standup', async () => {
    const { interaction, deferUpdate, editReply } = makeInteraction(
      'other:approve:standup-1',
    )

    await handleButtonInteraction(interaction, fakeClient, env)

    expect(deferUpdate).not.toHaveBeenCalled()
    expect(mocks.handleStandupInteraction).not.toHaveBeenCalled()
    expect(editReply).not.toHaveBeenCalled()
  })

  it('deferUpdate, delega interação e responde com emoji de sucesso', async () => {
    mocks.handleStandupInteraction.mockResolvedValue(
      Result.ok({
        action: 'approve',
        standupId: 'standup-1',
        message: 'Standup aprovado',
      }),
    )
    const { interaction, deferUpdate, editReply } = makeInteraction(
      'standup:approve:standup-1',
    )

    await handleButtonInteraction(interaction, fakeClient, env)

    expect(deferUpdate).toHaveBeenCalledTimes(1)
    expect(mocks.handleStandupInteraction).toHaveBeenCalledWith(
      'approve',
      'standup-1',
      {
        databaseUrl: ':memory:',
        discordChannelId: 'channel-123',
      },
      fakeClient,
    )
    expect(editReply).toHaveBeenCalledWith({
      content: '✅ Standup aprovado',
      components: [],
    })
  })

  it('responde erro quando interaction-handler retorna Err', async () => {
    mocks.handleStandupInteraction.mockResolvedValue(
      Result.err(new Error('database unavailable')),
    )
    const { interaction, editReply } = makeInteraction(
      'standup:reject:standup-1',
    )

    await handleButtonInteraction(interaction, fakeClient, env)

    expect(editReply).toHaveBeenCalledWith({
      content: '❌ Erro ao processar ação: database unavailable',
      components: [],
    })
  })
})
