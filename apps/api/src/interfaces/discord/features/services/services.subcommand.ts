// apps/api/src/interfaces/discord/features/services/services.subcommand.ts
import { Injectable, UseGuards } from '@nestjs/common'
import { MessageFlags } from 'discord.js'
import { Context, Options, type SlashCommandContext, Subcommand } from 'necord'
import {
  DiscordServiceHealthService,
  type DiscordServiceName,
} from '../../services/discord-service-health.service'
import { StandupCommandGroup } from '../../shared/decorators/standup-command-group.decorator'
import { EMBED_COLORS } from '../../shared/embeds'
import { DiscordUserLinkedGuard } from '../../shared/guards/discord-user-linked.guard'
import { ServicesDto } from './services.dto'

function formatUptime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`
  }

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes < 60) {
    return `${minutes}m ${remainingSeconds}s`
  }

  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

function serviceLabel(service: DiscordServiceName | 'all'): string {
  const labels: Record<DiscordServiceName | 'all', string> = {
    all: 'Todos',
    api: 'API',
    worker: 'Worker',
    bot: 'Discord Bot',
  }

  return labels[service]
}

function summaryColor(okCount: number, totalCount: number): number {
  if (okCount === totalCount) {
    return EMBED_COLORS.APPROVED
  }

  if (okCount === 0) {
    return EMBED_COLORS.REJECTED
  }

  return EMBED_COLORS.WARNING
}

@Injectable()
@StandupCommandGroup()
export class ServicesSubcommand {
  constructor(private readonly health: DiscordServiceHealthService) {}

  @Subcommand({
    name: 'services',
    description: 'Ver status dos serviços',
  })
  @UseGuards(DiscordUserLinkedGuard)
  public async onServices(
    @Context() [interaction]: SlashCommandContext,
    @Options() { service = 'all' }: ServicesDto,
  ) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    const statuses = await this.health.listServices(service)
    const okCount = statuses.filter((status) => status.ok).length

    await interaction.editReply({
      embeds: [
        {
          title: 'Status dos serviços',
          color: summaryColor(okCount, statuses.length),
          description: `Resultado: **${okCount}/${statuses.length}** online`,
          fields: statuses.map((status) => ({
            name: serviceLabel(status.service),
            value: [
              `Status: ${status.ok ? '✅ Online' : '❌ Offline'}`,
              `Latência: ${status.latencyMs}ms`,
              `Uptime: ${formatUptime(status.uptimeSeconds)}`,
              ...(status.error ? [`Erro: ${status.error}`] : []),
            ].join('\n'),
            inline: true,
          })),
          footer: {
            text: `standup-bot | ${interaction.client?.user?.tag ?? 'discord'}`,
          },
          timestamp: new Date().toISOString(),
        },
      ],
    })
  }
}
