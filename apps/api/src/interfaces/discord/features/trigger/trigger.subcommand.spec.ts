// apps/api/src/interfaces/discord/features/trigger/trigger.subcommand.spec.ts
import { describe, expect, it, vi } from 'vitest'
import { makeChatInputInteraction } from '../../../../test/discord/mock-interaction'
import { asSlashContext } from '../../../../test/discord/make-context'
import { TriggerSubcommand } from './trigger.subcommand'

describe('TriggerSubcommand', () => {
  it('delegates to TriggerConfirmationService.handleSlashCommand', async () => {
    const triggerSvc = { handleSlashCommand: vi.fn().mockResolvedValue(undefined) }
    const cmd = new TriggerSubcommand(triggerSvc as never)
    const interaction = makeChatInputInteraction()

    await cmd.onTrigger(asSlashContext(interaction), {} as never)

    expect(triggerSvc.handleSlashCommand).toHaveBeenCalledWith(interaction)
  })
})
