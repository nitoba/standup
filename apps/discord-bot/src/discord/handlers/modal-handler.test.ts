import { Result } from '@standup/domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handleStandupInteraction: vi.fn(),
  triggerStandup: vi.fn(),
  loggerInfo: vi.fn(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
  withContextInfo: vi.fn(),
  withContextError: vi.fn(),
  withContextWarn: vi.fn(),
  hasActiveSession: vi.fn(),
  getDb: vi.fn(),
}))

vi.mock('@standup/logger', () => ({
  createServiceLogger: vi.fn().mockReturnValue({
    info: mocks.loggerInfo,
    error: mocks.loggerError,
    warn: mocks.loggerWarn,
  }),
  withContext: vi.fn().mockReturnValue({
    info: mocks.withContextInfo,
    error: mocks.withContextError,
    warn: mocks.withContextWarn,
  }),
}))

vi.mock('./interaction-handler.js', () => ({
  handleStandupInteraction: mocks.handleStandupInteraction,
}))

vi.mock('../../services/trigger-standup-service.js', () => ({
  triggerStandup: mocks.triggerStandup,
}))

vi.mock('@standup/db', () => {
  function UserRepository() {
    return { hasActiveSession: mocks.hasActiveSession }
  }
  return { getDb: mocks.getDb, UserRepository }
})

import type { Client, ModalSubmitInteraction } from 'discord.js'
import { handleRegenerateModal } from './modal-handler.js'

function makeModalInteraction(
  customId: string,
  contextValue = '',
): {
  interaction: ModalSubmitInteraction
  deferUpdate: ReturnType<typeof vi.fn>
  editReply: ReturnType<typeof vi.fn>
} {
  const deferUpdate = vi.fn().mockResolvedValue(undefined)
  const editReply = vi.fn().mockResolvedValue(undefined)

  return {
    interaction: {
      customId,
      user: { id: 'user-123' },
      fields: {
        getTextInputValue: vi.fn().mockReturnValue(contextValue),
      },
      deferUpdate,
      editReply,
    } as unknown as ModalSubmitInteraction,
    deferUpdate,
    editReply,
  }
}

const fakeClient = {} as unknown as Client
const env = {
  DATABASE_URL: ':memory:',
  DISCORD_CHANNEL_ID: 'channel-123',
  API_BASE_URL: 'http://localhost:3333',
  INTERNAL_SECRET: 'test-secret',
}

describe('handleRegenerateModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.hasActiveSession.mockReturnValue(
      Result.ok({ userId: 'resolved-user-id', hasSession: true }),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('ignora modal com namespace invalido', async () => {
    const { interaction, deferUpdate } = makeModalInteraction(
      'other-modal:standup-1',
    )

    await handleRegenerateModal(interaction, fakeClient, env)

    expect(deferUpdate).not.toHaveBeenCalled()
    expect(mocks.handleStandupInteraction).not.toHaveBeenCalled()
    expect(mocks.triggerStandup).not.toHaveBeenCalled()
  })

  it('rejeita standup, dispara trigger com contexto e responde sucesso', async () => {
    mocks.handleStandupInteraction.mockResolvedValue(
      Result.ok({
        action: 'regenerate',
        standupId: 'standup-1',
        message: 'Standup rejeitado para regeneração.',
      }),
    )
    mocks.triggerStandup.mockResolvedValue(Result.ok({ accepted: true }))

    const { interaction, deferUpdate, editReply } = makeModalInteraction(
      'standup-regenerate-modal:standup-1',
      'Focar mais no card #1234',
    )

    await handleRegenerateModal(interaction, fakeClient, env)

    expect(deferUpdate).toHaveBeenCalledTimes(1)

    // Rejects the current standup
    expect(mocks.handleStandupInteraction).toHaveBeenCalledWith(
      'regenerate',
      'standup-1',
      { actorDiscordId: 'user-123', databaseUrl: ':memory:' },
    )

    // Triggers new generation with context
    expect(mocks.triggerStandup).toHaveBeenCalledWith(
      expect.any(String),
      'user-123',
      { apiBaseUrl: 'http://localhost:3333', internalSecret: 'test-secret' },
      {
        forceRegenerate: true,
        extraContext: 'Focar mais no card #1234',
      },
    )

    // Success message includes context
    expect(editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Regenerando standup do zero'),
        components: [],
      }),
    )
    const call = editReply.mock.calls.at(-1) as
      | [{ content: string }]
      | undefined
    expect(call).toBeDefined()
    expect(call?.[0].content).toContain('Focar mais no card #1234')
  })

  it('dispara trigger sem extraContext quando campo vazio', async () => {
    mocks.handleStandupInteraction.mockResolvedValue(
      Result.ok({
        action: 'regenerate',
        standupId: 'standup-1',
        message: 'Standup rejeitado para regeneração.',
      }),
    )
    mocks.triggerStandup.mockResolvedValue(Result.ok({ accepted: true }))

    const { interaction } = makeModalInteraction(
      'standup-regenerate-modal:standup-1',
      '', // empty context
    )

    await handleRegenerateModal(interaction, fakeClient, env)

    expect(mocks.triggerStandup).toHaveBeenCalledWith(
      expect.any(String),
      'user-123',
      { apiBaseUrl: 'http://localhost:3333', internalSecret: 'test-secret' },
      { forceRegenerate: true },
    )
  })

  it('retorna erro quando rejeição do standup falha', async () => {
    mocks.handleStandupInteraction.mockResolvedValue(
      Result.err(new Error('DB error')),
    )

    const { interaction, editReply } = makeModalInteraction(
      'standup-regenerate-modal:standup-1',
    )

    await handleRegenerateModal(interaction, fakeClient, env)

    expect(editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Erro ao rejeitar'),
        components: [],
      }),
    )
    expect(mocks.triggerStandup).not.toHaveBeenCalled()
  })

  it('retorna erro quando trigger falha após rejeição', async () => {
    mocks.handleStandupInteraction.mockResolvedValue(
      Result.ok({
        action: 'regenerate',
        standupId: 'standup-1',
        message: 'ok',
      }),
    )
    mocks.triggerStandup.mockResolvedValue(
      Result.err(new Error('API unreachable')),
    )

    const { interaction, editReply } = makeModalInteraction(
      'standup-regenerate-modal:standup-1',
    )

    await handleRegenerateModal(interaction, fakeClient, env)

    expect(editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('falhou ao disparar regeneração'),
        components: [],
      }),
    )
  })

  it('retorna erro quando trigger não é aceito (forbidden)', async () => {
    mocks.handleStandupInteraction.mockResolvedValue(
      Result.ok({
        action: 'regenerate',
        standupId: 'standup-1',
        message: 'ok',
      }),
    )
    mocks.triggerStandup.mockResolvedValue(
      Result.ok({ accepted: false, reason: 'forbidden' }),
    )

    const { interaction, editReply } = makeModalInteraction(
      'standup-regenerate-modal:standup-1',
    )

    await handleRegenerateModal(interaction, fakeClient, env)

    expect(editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('não está autorizado'),
        components: [],
      }),
    )
  })
})
