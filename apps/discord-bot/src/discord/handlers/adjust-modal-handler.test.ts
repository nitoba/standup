import { Result } from '@standup/domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  triggerStandup: vi.fn(),
  loggerInfo: vi.fn(),
  loggerError: vi.fn(),
  withContextInfo: vi.fn(),
  withContextError: vi.fn(),
  hasActiveSession: vi.fn(),
  getDb: vi.fn(),
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
import { handleAdjustModal } from './adjust-modal-handler.js'

function makeModalInteraction(
  customId: string,
  instructionValue = '',
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
        getTextInputValue: vi.fn().mockReturnValue(instructionValue),
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
  API_BASE_URL: 'http://localhost:3333',
  INTERNAL_SECRET: 'test-secret',
  DATABASE_URL: ':memory:',
}

describe('handleAdjustModal', () => {
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
    const { interaction, deferUpdate } = makeModalInteraction('other:standup-1')

    await handleAdjustModal(interaction, fakeClient, env)

    expect(deferUpdate).not.toHaveBeenCalled()
    expect(mocks.triggerStandup).not.toHaveBeenCalled()
  })

  it('dispara ajuste com rewriteFromStandupId + rewriteInstruction', async () => {
    mocks.triggerStandup.mockResolvedValue(Result.ok({ accepted: true }))

    const { interaction, editReply } = makeModalInteraction(
      'standup-adjust-modal:standup-1',
      'Remover item antigo e adicionar item novo',
    )

    await handleAdjustModal(interaction, fakeClient, env)

    expect(mocks.triggerStandup).toHaveBeenCalledWith(
      expect.any(String),
      'user-123',
      { apiBaseUrl: 'http://localhost:3333', internalSecret: 'test-secret' },
      {
        forceRegenerate: true,
        rewriteFromStandupId: 'standup-1',
        rewriteInstruction: 'Remover item antigo e adicionar item novo',
        replaceStandupId: 'standup-1',
      },
    )
    expect(editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Ajuste solicitado com sucesso'),
        components: [],
      }),
    )
  })

  it('retorna erro quando instruções não são informadas', async () => {
    const { interaction, editReply } = makeModalInteraction(
      'standup-adjust-modal:standup-1',
      '',
    )

    await handleAdjustModal(interaction, fakeClient, env)

    expect(mocks.triggerStandup).not.toHaveBeenCalled()
    expect(editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Informe as alterações desejadas'),
        components: [],
      }),
    )
  })

  it('retorna erro quando trigger falha', async () => {
    mocks.triggerStandup.mockResolvedValue(Result.err(new Error('API down')))
    const { interaction, editReply } = makeModalInteraction(
      'standup-adjust-modal:standup-1',
      'Ajuste x',
    )

    await handleAdjustModal(interaction, fakeClient, env)

    expect(editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Falha ao disparar ajuste'),
        components: [],
      }),
    )
  })

  it('retorna erro quando trigger não é aceito', async () => {
    mocks.triggerStandup.mockResolvedValue(
      Result.ok({ accepted: false, reason: 'forbidden' }),
    )
    const { interaction, editReply } = makeModalInteraction(
      'standup-adjust-modal:standup-1',
      'Ajuste x',
    )

    await handleAdjustModal(interaction, fakeClient, env)

    expect(editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('não está autorizado'),
        components: [],
      }),
    )
  })
})
