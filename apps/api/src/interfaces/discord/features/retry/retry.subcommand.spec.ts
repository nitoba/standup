// apps/api/src/interfaces/discord/features/retry/retry.subcommand.spec.ts
import { MessageFlags } from 'discord.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Result } from '../../../../shared/domain'
import { asSlashContext } from '../../../../test/discord/make-context'
import { makeChatInputInteraction } from '../../../../test/discord/mock-interaction'
import { RetrySubcommand } from './retry.subcommand'

function createCommand(overrides?: {
  session?: unknown
  standupResult?: unknown
  retryResult?: unknown
}) {
  const session =
    overrides && 'session' in overrides
      ? overrides.session
      : {
          hasSession: true,
          userId: 'app-user-1',
        }

  const auth = {
    resolveActiveSession: vi.fn().mockResolvedValue(session),
  }
  const standupRepository = {
    findLatestByUserAndDate: vi.fn().mockResolvedValue(
      overrides?.standupResult ??
        Result.ok({
          id: 'standup-1',
          status: 'delivery_pending',
        }),
    ),
  }
  const retryDm = {
    retryDm: vi
      .fn()
      .mockResolvedValue(
        overrides?.retryResult ??
          Result.ok({ standupId: 'standup-1', newStatus: 'pending_review' }),
      ),
  }

  return {
    auth,
    standupRepository,
    retryDm,
    cmd: new RetrySubcommand(
      auth as never,
      standupRepository as never,
      retryDm as never,
    ),
  }
}

describe('RetrySubcommand', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-30T15:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('defers reply as ephemeral before resolving the session', async () => {
    const { cmd, auth } = createCommand()
    const interaction = makeChatInputInteraction({ userId: 'discord-1' })

    await cmd.onRetry(asSlashContext(interaction))

    const deferCallIndex =
      interaction.deferReply.mock.invocationCallOrder[0] ?? 0
    const authCallIndex =
      auth.resolveActiveSession.mock.invocationCallOrder[0] ?? 0
    expect(deferCallIndex).toBeLessThan(authCallIndex)
    expect(interaction.deferReply).toHaveBeenCalledWith({
      flags: MessageFlags.Ephemeral,
    })
  })

  it('asks RetryDmService to redeliver the latest delivery-pending standup', async () => {
    const { cmd, auth, standupRepository, retryDm } = createCommand()
    const interaction = makeChatInputInteraction({ userId: 'discord-1' })

    await cmd.onRetry(asSlashContext(interaction))

    expect(auth.resolveActiveSession).toHaveBeenCalledWith('discord-1')
    expect(standupRepository.findLatestByUserAndDate).toHaveBeenCalledWith(
      'app-user-1',
      '2026-04-30',
    )
    expect(retryDm.retryDm).toHaveBeenCalledWith(
      'standup-1',
      'app-user-1',
      'discord-1',
    )
    expect(interaction.editReply).toHaveBeenCalledWith(
      '✅ DM reenviada com sucesso! Verifique sua caixa de mensagens directas.',
    )
  })

  it('replies with login message when session is missing', async () => {
    const { cmd, standupRepository, retryDm } = createCommand({
      session: null,
    })
    const interaction = makeChatInputInteraction()

    await cmd.onRetry(asSlashContext(interaction))

    expect(standupRepository.findLatestByUserAndDate).not.toHaveBeenCalled()
    expect(retryDm.retryDm).not.toHaveBeenCalled()
    expect(interaction.editReply).toHaveBeenCalledWith(
      'Você precisa estar logado para usar este comando. Use `/login`.',
    )
  })

  it('replies with repository error message when lookup fails', async () => {
    const { cmd, retryDm } = createCommand({
      standupResult: Result.err(new Error('db offline')),
    })
    const interaction = makeChatInputInteraction()

    await cmd.onRetry(asSlashContext(interaction))

    expect(retryDm.retryDm).not.toHaveBeenCalled()
    expect(interaction.editReply).toHaveBeenCalledWith(
      'Erro ao buscar standup do dia. Tente novamente.',
    )
  })

  it('replies when no standup is available for today', async () => {
    const { cmd, retryDm } = createCommand({
      standupResult: Result.ok(null),
    })
    const interaction = makeChatInputInteraction()

    await cmd.onRetry(asSlashContext(interaction))

    expect(retryDm.retryDm).not.toHaveBeenCalled()
    expect(interaction.editReply).toHaveBeenCalledWith(
      'Nenhum standup pendente de entrega encontrado para hoje.',
    )
  })

  it('replies when latest standup is not delivery_pending', async () => {
    const { cmd, retryDm } = createCommand({
      standupResult: Result.ok({
        id: 'standup-1',
        status: 'approved',
      }),
    })
    const interaction = makeChatInputInteraction()

    await cmd.onRetry(asSlashContext(interaction))

    expect(retryDm.retryDm).not.toHaveBeenCalled()
    expect(interaction.editReply).toHaveBeenCalledWith(
      'Seu standup está no estado "Aprovado", não é possível reenviar a DM.',
    )
  })

  it('replies with retry error message when retry fails', async () => {
    const { cmd } = createCommand({
      retryResult: Result.err(new Error('discord offline')),
    })
    const interaction = makeChatInputInteraction()

    await cmd.onRetry(asSlashContext(interaction))

    expect(interaction.editReply).toHaveBeenCalledWith(
      '❌ Erro ao reenviar DM: discord offline',
    )
  })
})
