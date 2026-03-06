import { ExternalServiceError, Result } from '@standup/domain'
import type { ButtonInteraction } from 'discord.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  triggerStandup: vi.fn(),
}))

vi.mock('../../services/trigger-standup-service.js', () => ({
  triggerStandup: mocks.triggerStandup,
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
    })

    expect(deferUpdate).toHaveBeenCalledTimes(1)
    expect(mocks.triggerStandup).toHaveBeenCalledWith(
      'user-123',
      { apiBaseUrl: 'http://localhost:3333' },
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
        '✅ Trigger manual enviado com sucesso. O job foi aceito e comecou a processar em background.',
      components: [],
    })
  })

  it('cancel: cancela operacao sem chamar API', async () => {
    const request = createPendingTriggerRequest('user-123', {})
    const { interaction, editReply } = makeInteraction('user-123')

    await handleTriggerButtonInteraction(interaction, 'cancel', request.id, {
      apiBaseUrl: 'http://localhost:3333',
    })

    expect(mocks.triggerStandup).not.toHaveBeenCalled()
    expect(editReply).toHaveBeenCalledWith({
      content: '❌ Operacao cancelada.',
      components: [],
    })
  })

  it('retorna expirado quando request nao existe', async () => {
    const { interaction, editReply } = makeInteraction('user-123')

    await handleTriggerButtonInteraction(interaction, 'confirm', 'missing', {
      apiBaseUrl: 'http://localhost:3333',
    })

    expect(mocks.triggerStandup).not.toHaveBeenCalled()
    expect(editReply).toHaveBeenCalledWith({
      content:
        '⌛ Esta confirmacao expirou. Rode `/standup trigger` novamente para criar uma nova solicitacao.',
      components: [],
    })
  })

  it('rejeita quando usuario diferente tenta confirmar', async () => {
    const request = createPendingTriggerRequest('owner-user', {})
    const { interaction, editReply } = makeInteraction('intruder-user')

    await handleTriggerButtonInteraction(interaction, 'confirm', request.id, {
      apiBaseUrl: 'http://localhost:3333',
    })

    expect(mocks.triggerStandup).not.toHaveBeenCalled()
    expect(editReply).toHaveBeenCalledWith({
      content: '❌ Esta confirmacao pertence a outro usuario.',
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
    })

    expect(editReply).toHaveBeenNthCalledWith(1, {
      content: '⏳ Processando trigger manual...',
      components: [],
    })
    expect(editReply).toHaveBeenNthCalledWith(2, {
      content: '❌ Voce nao esta autorizado a disparar o standup manualmente.',
      components: [],
    })
  })
})
