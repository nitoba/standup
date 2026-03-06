import { createServiceLogger } from '@standup/logger'
import type { ChatInputCommandInteraction, Client } from 'discord.js'
import { MessageFlags } from 'discord.js'
import {
  checkRemoteServiceHealth,
  type RemoteServiceHealth,
  type RemoteServiceName,
} from '../../services/service-health-check.js'
import { EMBED_COLORS } from '../embeds.js'

const logger = createServiceLogger({
  service: 'discord-bot',
  component: 'commands-services',
})

type ServiceFilter = 'all' | RemoteServiceName | 'bot'

interface BotServiceHealth {
  service: 'bot'
  ok: boolean
  latencyMs: number
  statusCode?: number
  uptimeSeconds: number
  error?: string
}

interface ServicesCommandDeps {
  apiBaseUrl: string
  workerInternalUrl: string
  client: Client
}

function formatUptime(seconds?: number): string {
  if (typeof seconds !== 'number') return 'n/a'
  if (seconds < 60) return `${seconds}s`

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h ${remainingMinutes}m`
}

function serviceLabel(service: ServiceFilter): string {
  const labels: Record<ServiceFilter, string> = {
    all: 'Todos',
    api: 'API',
    worker: 'Worker',
    bot: 'Discord Bot',
  }

  return labels[service]
}

function buildBotHealth(client: Client): BotServiceHealth {
  const ready = client.isReady()
  return {
    service: 'bot',
    ok: ready,
    latencyMs: 0,
    uptimeSeconds: Math.floor(process.uptime()),
    error: ready ? undefined : 'Discord gateway not ready',
  }
}

function renderStatusField(status: RemoteServiceHealth | BotServiceHealth): {
  name: string
  value: string
  inline: boolean
} {
  const lines = [
    `Status: ${status.ok ? '✅ Online' : '❌ Offline'}`,
    `Latencia: ${status.latencyMs}ms`,
    `Uptime: ${formatUptime(status.uptimeSeconds)}`,
  ]

  if (typeof status.statusCode === 'number') {
    lines.push(`HTTP: ${status.statusCode}`)
  }

  if (status.error) {
    lines.push(`Erro: ${status.error}`)
  }

  return {
    name: serviceLabel(status.service),
    value: lines.join('\n'),
    inline: true,
  }
}

function summaryColor(okCount: number, totalCount: number): number {
  if (okCount === totalCount) return EMBED_COLORS.APPROVED
  if (okCount === 0) return EMBED_COLORS.REJECTED
  return EMBED_COLORS.WARNING
}

export async function handleServices(
  interaction: ChatInputCommandInteraction,
  deps: ServicesCommandDeps,
): Promise<void> {
  const filter =
    (interaction.options.getString('service') as ServiceFilter | null) ?? 'all'

  logger.info('Received /standup services command', {
    userId: interaction.user.id,
    filter,
  })

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const statuses: Array<RemoteServiceHealth | BotServiceHealth> = []

  if (filter === 'all' || filter === 'api') {
    statuses.push(await checkRemoteServiceHealth('api', deps.apiBaseUrl))
  }

  if (filter === 'all' || filter === 'worker') {
    statuses.push(
      await checkRemoteServiceHealth('worker', deps.workerInternalUrl),
    )
  }

  if (filter === 'all' || filter === 'bot') {
    statuses.push(buildBotHealth(deps.client))
  }

  const okCount = statuses.filter((status) => status.ok).length
  const totalCount = statuses.length

  await interaction.editReply({
    embeds: [
      {
        title: 'Status dos servicos',
        color: summaryColor(okCount, totalCount),
        description: `Resultado: **${okCount}/${totalCount}** online`,
        fields: statuses.map((status) => renderStatusField(status)),
        footer: {
          text: 'standup-bot | /standup services',
        },
        timestamp: new Date().toISOString(),
      },
    ],
  })
}
