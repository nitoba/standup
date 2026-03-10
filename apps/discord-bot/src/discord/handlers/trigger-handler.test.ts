import { ExternalServiceError, Result } from '@standup/domain'
import type { ButtonInteraction } from 'discord.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  triggerStandup: vi.fn(),
  hasActiveSession: vi.fn(),
  getDb: vi.fn(),
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

vi.mock('@standup/logger', () => ({
  createServiceLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
  withContext: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}))

import { handleTriggerButtonInteraction } from './trigger-handler.js'
import {
  clearPendingTriggerRequests,
  createPendingTriggerRequest,
} from './trigger-request-store.js'

function makeInteraction(userId: string): {
  interaction: ButtonInteraction
  deferUpdate: ReturnType<typeof vi.fn>
  editReply: ReturnType<typeof vi.fn>
} {
  const deferUpdate = vi.fn().mockResolvedValue(undefined)
  const editReply = vi.fn().mockResolvedValue(undefined)

  return {
    interaction: {
      user: { id: userId },
      deferUpdate,
      editReply,
    } as unknown as ButtonInteraction,
    deferUpdate,
    editReply,
  }
}

describe('handleTriggerButtonInteraction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearPendingTriggerRequests()
    mocks.hasActiveSession.mockReturnValue(
      Result.ok({ userId: 'resolved-user-id', hasSession: true }),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
    clearPendingTriggerRequests()
  })

  it('confirm: dispara trigger com opcoes salvas e remove botoes', async () => {
    mocks.triggerStandup.mockResolvedValue(Result.ok({ accepted: true }))

    const request = createPendingTriggerRequest('user-123', {
      forceRegenerate: true,
      extraContext: 'focar no card 123',
    })
    const { interaction, deferUpdate, editReply } = makeInteraction('user-123')

    await handleTriggerButtonInteraction(interaction, 'confirm', request.id, {
      apiBaseUrl: 'http://localhost:3333',
      internalSecret: 'test-secret',
      databaseUrl: ':memory:',
    })

    expect(deferUpdate).toHaveBeenCalledTimes(1)
    expect(mocks.triggerStandup).toHaveBeenCalledWith(
      expect.any(String),
      'user-123',
      { apiBaseUrl: 'http://localhost:3333', internalSecret: 'test-secret' },
      {
        forceRegenerate: true,
        extraContext: 'focar no card 123',
      },
    )
    expect(editReply).toHaveBeenNthCalledWith(1, {
      content: '⏳ Processando trigger manual...',
      components: [],
    })
    expect(editReply).toHaveBeenNthCalledWith(2, {
      content:
        '✅ Trigger manual enviado com sucesso. O job foi aceito e está processando em background.\n\nVocê receberá uma DM quando o standup estiver pronto para revisão.',
      components: [],
    })
  })

  it('cancel: cancela operação sem chamar API', async () => {
    const request = createPendingTriggerRequest('user-123', {})
    const { interaction, editReply } = makeInteraction('user-123')

    await handleTriggerButtonInteraction(interaction, 'cancel', request.id, {
      apiBaseUrl: 'http://localhost:3333',
      internalSecret: 'test-secret',
      databaseUrl: ':memory:',
    })

    expect(mocks.triggerStandup).not.toHaveBeenCalled()
    expect(editReply).toHaveBeenCalledWith({
      content: '❌ Operação cancelada.',
      components: [],
    })
  })

  it('retorna expirado quando request não existe', async () => {
    const { interaction, editReply } = makeInteraction('user-123')

    await handleTriggerButtonInteraction(interaction, 'confirm', 'missing', {
      apiBaseUrl: 'http://localhost:3333',
      internalSecret: 'test-secret',
      databaseUrl: ':memory:',
    })

    expect(mocks.triggerStandup).not.toHaveBeenCalled()
    expect(editReply).toHaveBeenCalledWith({
      content:
        '⌛ Esta confirmação expirou. Rode `/standup trigger` novamente para criar uma nova solicitação.',
      components: [],
    })
  })

  it('rejeita quando usuario diferente tenta confirmar', async () => {
    const request = createPendingTriggerRequest('owner-user', {})
    const { interaction, editReply } = makeInteraction('intruder-user')

    await handleTriggerButtonInteraction(interaction, 'confirm', request.id, {
      apiBaseUrl: 'http://localhost:3333',
      internalSecret: 'test-secret',
      databaseUrl: ':memory:',
    })

    expect(mocks.triggerStandup).not.toHaveBeenCalled()
    expect(editReply).toHaveBeenCalledWith({
      content: '❌ Esta confirmação pertence a outro usuário.',
      components: [],
    })
  })

  it('retorna erro quando trigger API falha', async () => {
    mocks.triggerStandup.mockResolvedValue(
      Result.err(
        new ExternalServiceError({ service: 'api', message: 'HTTP 503' }),
      ),
    )

    const request = createPendingTriggerRequest('user-123', {})
    const { interaction, editReply } = makeInteraction('user-123')

    await handleTriggerButtonInteraction(interaction, 'confirm', request.id, {
      apiBaseUrl: 'http://localhost:3333',
      internalSecret: 'test-secret',
      databaseUrl: ':memory:',
    })

    expect(editReply).toHaveBeenNthCalledWith(1, {
      content: '⏳ Processando trigger manual...',
      components: [],
    })
    expect(editReply).toHaveBeenNthCalledWith(2, {
      content: '❌ Falha ao disparar o standup agora.\n\nDetalhe: HTTP 503',
      components: [],
    })
  })

  it('retorna mensagem de autorizado quando API responde forbidden', async () => {
    mocks.triggerStandup.mockResolvedValue(
      Result.ok({ accepted: false, reason: 'forbidden' }),
    )

    const request = createPendingTriggerRequest('user-123', {})
    const { interaction, editReply } = makeInteraction('user-123')

    await handleTriggerButtonInteraction(interaction, 'confirm', request.id, {
      apiBaseUrl: 'http://localhost:3333',
      internalSecret: 'test-secret',
      databaseUrl: ':memory:',
    })

    expect(editReply).toHaveBeenNthCalledWith(1, {
      content: '⏳ Processando trigger manual...',
      components: [],
    })
    expect(editReply).toHaveBeenNthCalledWith(2, {
      content: '❌ Você não está autorizado a disparar o standup manualmente.',
      components: [],
    })
  })

  it('retorna mensagem quando já existe standup pendente para hoje', async () => {
    mocks.triggerStandup.mockResolvedValue(
      Result.ok({
        accepted: false,
        reason: 'pending_review_exists',
        standupId: 'standup-abc',
      }),
    )

    const request = createPendingTriggerRequest('user-123', {})
    const { interaction, editReply } = makeInteraction('user-123')

    await handleTriggerButtonInteraction(interaction, 'confirm', request.id, {
      apiBaseUrl: 'http://localhost:3333',
      internalSecret: 'test-secret',
      databaseUrl: ':memory:',
    })

    expect(editReply).toHaveBeenNthCalledWith(2, {
      content:
        '⚠️ Já existe um standup de hoje aguardando revisão. Aprove ou rejeite o standup atual antes de gerar um novo.',
      components: [],
    })
  })

  it('retorna mensagem quando o standup de hoje já foi aprovado', async () => {
    mocks.triggerStandup.mockResolvedValue(
      Result.ok({
        accepted: false,
        reason: 'already_approved_today',
        standupId: 'standup-abc',
      }),
    )

    const request = createPendingTriggerRequest('user-123', {})
    const { interaction, editReply } = makeInteraction('user-123')

    await handleTriggerButtonInteraction(interaction, 'confirm', request.id, {
      apiBaseUrl: 'http://localhost:3333',
      internalSecret: 'test-secret',
      databaseUrl: ':memory:',
    })

    expect(editReply).toHaveBeenNthCalledWith(2, {
      content:
        '✅ O standup de hoje já foi gerado e aprovado. Verifique sua DM ou use `/standup list` para consultar o status.',
      components: [],
    })
  })
})
