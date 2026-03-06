import { DbError, NotFoundError, Result } from '@standup/domain'
import { type ButtonInteraction, MessageFlags } from 'discord.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getDb: vi.fn().mockReturnValue({}),
  repoFindById: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  withContextInfo: vi.fn(),
  withContextWarn: vi.fn(),
}))

vi.mock('@standup/db', () => {
  function StandupRepository() {
    return { findById: mocks.repoFindById }
  }

  return { getDb: mocks.getDb, StandupRepository }
})

vi.mock('@standup/logger', () => ({
  createServiceLogger: vi.fn().mockReturnValue({
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
  }),
  withContext: vi.fn().mockReturnValue({
    info: mocks.withContextInfo,
    warn: mocks.withContextWarn,
  }),
}))

import { handleCopyButtonInteraction } from './copy-handler.js'

function makeInteraction(): {
  interaction: ButtonInteraction
  deferReply: ReturnType<typeof vi.fn>
  editReply: ReturnType<typeof vi.fn>
  followUp: ReturnType<typeof vi.fn>
} {
  const deferReply = vi.fn().mockResolvedValue(undefined)
  const editReply = vi.fn().mockResolvedValue(undefined)
  const followUp = vi.fn().mockResolvedValue(undefined)

  return {
    interaction: {
      user: { id: 'user-123' },
      deferReply,
      editReply,
      followUp,
    } as unknown as ButtonInteraction,
    deferReply,
    editReply,
    followUp,
  }
}

describe('handleCopyButtonInteraction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('envia conteúdo puro do standup em resposta ephemeral', async () => {
    mocks.repoFindById.mockResolvedValue(
      Result.ok({ id: 'standup-1', content: '**Standup**\n\n- item' }),
    )
    const { interaction, deferReply, editReply, followUp } = makeInteraction()

    await handleCopyButtonInteraction(interaction, 'content', 'standup-1', {
      databaseUrl: ':memory:',
    })

    expect(deferReply).toHaveBeenCalledWith({
      flags: MessageFlags.Ephemeral,
    })
    expect(editReply).toHaveBeenCalledWith('**Standup**\n\n- item')
    expect(followUp).not.toHaveBeenCalled()
  })

  it('quebra em múltiplas mensagens quando o conteúdo excede 2000 chars', async () => {
    const long = `${'A'.repeat(1999)}\n${'B'.repeat(1999)}`
    mocks.repoFindById.mockResolvedValue(
      Result.ok({ id: 'standup-1', content: long }),
    )
    const { interaction, editReply, followUp } = makeInteraction()

    await handleCopyButtonInteraction(interaction, 'content', 'standup-1', {
      databaseUrl: ':memory:',
    })

    expect(editReply).toHaveBeenCalledTimes(1)
    expect(followUp).toHaveBeenCalledTimes(1)
    expect(followUp).toHaveBeenCalledWith(
      expect.objectContaining({ flags: MessageFlags.Ephemeral }),
    )
  })

  it('retorna mensagem amigável quando standup não existe', async () => {
    mocks.repoFindById.mockResolvedValue(
      Result.err(new NotFoundError({ resource: 'standup', id: 'standup-404' })),
    )
    const { interaction, editReply } = makeInteraction()

    await handleCopyButtonInteraction(interaction, 'content', 'standup-404', {
      databaseUrl: ':memory:',
    })

    expect(editReply).toHaveBeenCalledWith(
      '❌ Standup nao encontrado para copia.',
    )
  })

  it('retorna erro quando ação de cópia é inválida', async () => {
    const { interaction, editReply } = makeInteraction()

    await handleCopyButtonInteraction(
      interaction,
      'invalid' as unknown as 'content',
      'standup-1',
      { databaseUrl: ':memory:' },
    )

    expect(editReply).toHaveBeenCalledWith('❌ Acao de copia desconhecida.')
  })

  it('retorna erro genérico quando DB falha', async () => {
    mocks.repoFindById.mockResolvedValue(
      Result.err(
        new DbError({ operation: 'findById', message: 'database unavailable' }),
      ),
    )
    const { interaction, editReply } = makeInteraction()

    await handleCopyButtonInteraction(interaction, 'content', 'standup-1', {
      databaseUrl: ':memory:',
    })

    expect(editReply).toHaveBeenCalledWith(
      '❌ Erro ao buscar standup: database unavailable',
    )
  })
})
