// apps/api/src/interfaces/discord/features/services/services.subcommand.spec.ts
import { MessageFlags } from 'discord.js'
import { describe, expect, it, vi } from 'vitest'
import { asSlashContext } from '../../../../test/discord/make-context'
import { makeChatInputInteraction } from '../../../../test/discord/mock-interaction'
import { EMBED_COLORS } from '../../shared/embeds'
import { ServicesSubcommand } from './services.subcommand'

describe('ServicesSubcommand', () => {
  it('defers reply as ephemeral before querying service health', async () => {
    const health = {
      listServices: vi.fn().mockResolvedValue([]),
    }
    const cmd = new ServicesSubcommand(health as never)
    const interaction = makeChatInputInteraction()

    await cmd.onServices(asSlashContext(interaction), {})

    const deferCallIndex =
      interaction.deferReply.mock.invocationCallOrder[0] ?? 0
    const listCallIndex = health.listServices.mock.invocationCallOrder[0] ?? 0
    expect(deferCallIndex).toBeLessThan(listCallIndex)
    expect(interaction.deferReply).toHaveBeenCalledWith({
      flags: MessageFlags.Ephemeral,
    })
  })

  it('queries all services by default', async () => {
    const health = {
      listServices: vi.fn().mockResolvedValue([]),
    }
    const cmd = new ServicesSubcommand(health as never)
    const interaction = makeChatInputInteraction()

    await cmd.onServices(asSlashContext(interaction), {})

    expect(health.listServices).toHaveBeenCalledWith('all')
  })

  it('queries the requested service filter', async () => {
    const health = {
      listServices: vi.fn().mockResolvedValue([]),
    }
    const cmd = new ServicesSubcommand(health as never)
    const interaction = makeChatInputInteraction()

    await cmd.onServices(asSlashContext(interaction), { service: 'api' })

    expect(health.listServices).toHaveBeenCalledWith('api')
  })

  it('replies with the legacy health summary embed', async () => {
    const health = {
      listServices: vi.fn().mockResolvedValue([
        {
          service: 'api',
          ok: true,
          latencyMs: 12,
          uptimeSeconds: 70,
        },
        {
          service: 'bot',
          ok: false,
          latencyMs: 5,
          uptimeSeconds: 3700,
          error: 'Discord gateway not ready',
        },
      ]),
    }
    const cmd = new ServicesSubcommand(health as never)
    const interaction = makeChatInputInteraction() as ReturnType<
      typeof makeChatInputInteraction
    > & {
      client: { user: { tag: string } }
    }
    interaction.client = { user: { tag: 'standup#0001' } }

    await cmd.onServices(asSlashContext(interaction), { service: 'all' })

    expect(interaction.editReply).toHaveBeenCalledWith({
      embeds: [
        expect.objectContaining({
          title: 'Status dos serviços',
          color: EMBED_COLORS.WARNING,
          description: 'Resultado: **1/2** online',
          footer: { text: 'standup-bot | standup#0001' },
          fields: [
            {
              name: 'API',
              value: 'Status: ✅ Online\nLatência: 12ms\nUptime: 1m 10s',
              inline: true,
            },
            {
              name: 'Discord Bot',
              value:
                'Status: ❌ Offline\nLatência: 5ms\nUptime: 1h 1m\nErro: Discord gateway not ready',
              inline: true,
            },
          ],
        }),
      ],
    })
  })
})
