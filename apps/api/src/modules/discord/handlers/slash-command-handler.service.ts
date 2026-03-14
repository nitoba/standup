import { Injectable } from '@nestjs/common'
import {
  type ChatInputCommandInteraction,
  type Client,
  MessageFlags,
} from 'discord.js'
import { StandupRepository } from '../../../shared/database/repositories/standup.repository'
import { UserRepository } from '../../../shared/database/repositories/user.repository'
import type { StandupStatus } from '../../../shared/domain'
import { Result } from '../../../shared/domain'
import { EMBED_COLORS } from '../embeds'
import { DiscordAuthService } from '../services/discord-auth.service'
import {
  DiscordServiceHealthService,
  type DiscordServiceName,
} from '../services/discord-service-health.service'
import { SettingsInteractionService } from './settings-interaction.service'
import { StandupInteractionService } from './standup-interaction.service'
import { TriggerConfirmationService } from './trigger-confirmation.service'

const AUTH_REQUIRED_SUBCOMMANDS = new Set([
  'trigger',
  'list',
  'approve',
  'services',
  'settings',
])

function standupStatusLabel(status: StandupStatus): string {
  const labels: Record<StandupStatus, string> = {
    draft: 'Draft',
    pending_review: 'Pendente de Revisão',
    approved: 'Aprovado',
    rejected: 'Rejeitado',
    published: 'Publicado',
  }

  return labels[status]
}

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
export class SlashCommandHandlerService {
  constructor(
    private readonly auth: DiscordAuthService,
    private readonly userRepository: UserRepository,
    private readonly standupRepository: StandupRepository,
    private readonly health: DiscordServiceHealthService,
    private readonly settings: SettingsInteractionService,
    private readonly standupInteraction: StandupInteractionService,
    private readonly triggerConfirmation: TriggerConfirmationService,
  ) {}

  async handle(
    interaction: ChatInputCommandInteraction,
    client: Client,
  ): Promise<void> {
    if (interaction.commandName === 'login') {
      await this.handleLogin(interaction)
      return
    }

    if (interaction.commandName === 'logout') {
      await this.handleLogout(interaction)
      return
    }

    if (interaction.commandName !== 'standup') {
      return
    }

    const subcommand = interaction.options.getSubcommand()

    if (AUTH_REQUIRED_SUBCOMMANDS.has(subcommand)) {
      const authed = await this.auth.requireChatAuth(interaction)
      if (!authed) {
        return
      }
    }

    if (subcommand === 'trigger') {
      await this.triggerConfirmation.handleSlashCommand(interaction)
      return
    }

    if (subcommand === 'list') {
      await this.handleList(interaction)
      return
    }

    if (subcommand === 'approve') {
      await this.handleApprove(interaction)
      return
    }

    if (subcommand === 'settings') {
      await this.settings.handleCommand(interaction)
      return
    }

    if (subcommand === 'services') {
      await this.handleServices(interaction, client)
    }
  }

  private async handleLogin(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const session = await this.auth.resolveActiveSession(interaction.user.id)
    if (session?.hasSession) {
      await interaction.reply({
        content: 'Você já está logado! Use `/logout` para encerrar sua sessão.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    await this.auth.replyWithLoginLink(interaction, session)
  }

  private async handleLogout(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const checkResult = await this.userRepository.hasActiveSession(
      interaction.user.id,
    )

    if (Result.isError(checkResult)) {
      await interaction.reply({
        content: 'Erro interno ao verificar sessão. Tente novamente.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    if (checkResult.value === null) {
      await interaction.reply({
        content:
          'Você não está registrado no sistema. Use `/login` para conectar sua conta.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    if (!checkResult.value.hasSession) {
      await interaction.reply({
        content: 'Você não possui sessão ativa. Use `/login` para reconectar.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    const deleteResult = await this.userRepository.deleteSessionsByDiscordId(
      interaction.user.id,
    )

    if (Result.isError(deleteResult)) {
      await interaction.reply({
        content: 'Erro ao encerrar sessão. Tente novamente.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    await interaction.reply({
      content:
        'Sessão encerrada com sucesso. Use `/login` quando quiser reconectar.',
      flags: MessageFlags.Ephemeral,
    })
  }

  private async handleList(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const page = interaction.options.getInteger('page') ?? 1
    const search = interaction.options.getString('search')?.trim() || undefined
    const status = interaction.options.getString(
      'status',
    ) as StandupStatus | null

    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    const session = await this.auth.resolveActiveSession(interaction.user.id)
    const result = await this.standupRepository.list({
      userId: session?.hasSession ? session.userId : undefined,
      status: status ?? undefined,
      search,
      page,
      pageSize: 10,
    })

    if (result.isErr()) {
      await interaction.editReply(
        `❌ Erro ao buscar standups: ${result.error.message}`,
      )
      return
    }

    if (result.value.items.length === 0) {
      await interaction.editReply('📭 Nenhum standup encontrado.')
      return
    }

    const embeds = result.value.items.map((record) => ({
      title: `Standup de ${record.date}`,
      color: EMBED_COLORS.REVIEW,
      fields: [
        {
          name: 'Status',
          value: standupStatusLabel(record.status),
          inline: true,
        },
        {
          name: 'Tipo',
          value: record.meetingType || 'daily',
          inline: true,
        },
        {
          name: 'ID',
          value: `\`${record.id}\``,
          inline: false,
        },
      ],
      footer: {
        text: `standup-bot | página ${result.value.page}/${result.value.totalPages || 1} | ${result.value.total} standup(s)`,
      },
    }))

    await interaction.editReply({ embeds })
  }

  private async handleApprove(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const standupId = interaction.options.getString('id', true)

    await interaction.deferReply({ flags: MessageFlags.Ephemeral })
    const result = await this.standupInteraction.handle(
      'approve',
      standupId,
      interaction.user.id,
    )

    if (result.isErr()) {
      await interaction.editReply(`❌ Erro ao aprovar: ${result.error.message}`)
      return
    }

    await interaction.editReply(`✅ ${result.value.message}`)
  }

  private async handleServices(
    interaction: ChatInputCommandInteraction,
    client: Client,
  ): Promise<void> {
    const filter =
      (interaction.options.getString('service') as
        | DiscordServiceName
        | 'all'
        | null) ?? 'all'

    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    const statuses = await this.health.listServices(filter)
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
            text: `standup-bot | ${client.user?.tag ?? 'discord'}`,
          },
          timestamp: new Date().toISOString(),
        },
      ],
    })
  }
}
