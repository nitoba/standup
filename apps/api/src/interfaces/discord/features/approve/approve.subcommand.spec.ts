// apps/api/src/interfaces/discord/features/approve/approve.subcommand.spec.ts
import { MessageFlags } from 'discord.js'
import { describe, expect, it, vi } from 'vitest'
import { Result } from '../../../../shared/domain'
import { asSlashContext } from '../../../../test/discord/make-context'
import { makeChatInputInteraction } from '../../../../test/discord/mock-interaction'
import { ApproveSubcommand } from './approve.subcommand'

describe('ApproveSubcommand', () => {
  it('defers reply as ephemeral before approving the standup', async () => {
    const reviewActions = {
      handle: vi.fn().mockResolvedValue(
        Result.ok({
          action: 'approve',
          standupId: 'std-1',
          userId: 'user-1',
          newStatus: 'approved',
          message: 'Standup aprovado!',
        }),
      ),
    }
    const cmd = new ApproveSubcommand(reviewActions as never)
    const interaction = makeChatInputInteraction({ userId: 'discord-1' })

    await cmd.onApprove(asSlashContext(interaction), { id: 'std-1' })

    const deferCallIndex =
      interaction.deferReply.mock.invocationCallOrder[0] ?? 0
    const handleCallIndex =
      reviewActions.handle.mock.invocationCallOrder[0] ?? 0
    expect(deferCallIndex).toBeLessThan(handleCallIndex)
    expect(interaction.deferReply).toHaveBeenCalledWith({
      flags: MessageFlags.Ephemeral,
    })
  })

  it('delegates approve to ReviewActionService with id from options and actor Discord id', async () => {
    const reviewActions = {
      handle: vi.fn().mockResolvedValue(
        Result.ok({
          action: 'approve',
          standupId: 'std-1',
          userId: 'user-1',
          newStatus: 'approved',
          message: 'Standup aprovado!',
        }),
      ),
    }
    const cmd = new ApproveSubcommand(reviewActions as never)
    const interaction = makeChatInputInteraction({ userId: 'discord-1' })

    await cmd.onApprove(asSlashContext(interaction), { id: 'std-1' })

    expect(reviewActions.handle).toHaveBeenCalledWith(
      'approve',
      'std-1',
      'discord-1',
    )
  })

  it('replies with success message when approval succeeds', async () => {
    const reviewActions = {
      handle: vi.fn().mockResolvedValue(
        Result.ok({
          action: 'approve',
          standupId: 'std-1',
          userId: 'user-1',
          newStatus: 'approved',
          message: 'Standup aprovado!',
        }),
      ),
    }
    const cmd = new ApproveSubcommand(reviewActions as never)
    const interaction = makeChatInputInteraction()

    await cmd.onApprove(asSlashContext(interaction), { id: 'std-1' })

    expect(interaction.editReply).toHaveBeenCalledWith('✅ Standup aprovado!')
  })

  it('replies with legacy error message when approval fails', async () => {
    const reviewActions = {
      handle: vi
        .fn()
        .mockResolvedValue(Result.err(new Error('falha ao aprovar'))),
    }
    const cmd = new ApproveSubcommand(reviewActions as never)
    const interaction = makeChatInputInteraction()

    await cmd.onApprove(asSlashContext(interaction), { id: 'std-1' })

    expect(interaction.editReply).toHaveBeenCalledWith(
      '❌ Erro ao aprovar: falha ao aprovar',
    )
  })
})
