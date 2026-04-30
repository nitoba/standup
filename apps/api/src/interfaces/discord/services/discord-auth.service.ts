import { Injectable } from '@nestjs/common'
import {
  ActionRowBuilder,
  ButtonBuilder,
  type ButtonInteraction,
  ButtonStyle,
  type ChatInputCommandInteraction,
  type MessageComponentInteraction,
  MessageFlags,
  type ModalSubmitInteraction,
} from 'discord.js'
import { UserRepository } from '../../../platform/database/repositories/user.repository'
import { EnvService } from '../../../platform/env/env.service'
import { AppLoggerFactory } from '../../../platform/logger'
import { Result } from '../../../shared/domain'

type ReplyCapableInteraction =
  | ChatInputCommandInteraction
  | ButtonInteraction
  | ModalSubmitInteraction
  | MessageComponentInteraction

@Injectable()
export class DiscordAuthService {
  private readonly logger: ReturnType<AppLoggerFactory['create']>
  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly userRepository: UserRepository,
    private readonly env: EnvService,
  ) {
    this.logger = this.loggerFactory.create('discord-auth')
  }

  get loginUrl(): string {
    return `${this.env.auth.baseUrl}/auth/login/discord`
  }

  async resolveActiveSession(
    discordUserId: string,
  ): Promise<{ userId: string; hasSession: boolean } | null> {
    const result = await this.userRepository.hasActiveSession(discordUserId)

    if (result.isErr()) {
      this.logger.error('Failed to resolve active session', {
        discordUserId,
        error: result.error.message,
      })
      return null
    }

    return result.value
  }

  async requireChatAuth(
    interaction: ChatInputCommandInteraction,
  ): Promise<{ userId: string } | null> {
    const session = await this.resolveActiveSession(interaction.user.id)
    if (session?.hasSession) {
      return { userId: session.userId }
    }

    await this.replyWithLoginLink(interaction, session)
    return null
  }

  async replySessionExpired(interaction: {
    editReply: (payload: {
      content: string
      components: []
    }) => Promise<unknown>
  }): Promise<void> {
    await interaction.editReply({
      content:
        '❌ Sessão expirada ou usuário não registrado. Use `/login` para reconectar.',
      components: [],
    })
  }

  async replyWithLoginLink(
    interaction: ReplyCapableInteraction,
    session: { userId: string; hasSession: boolean } | null = null,
  ): Promise<void> {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel('Login com Discord')
        .setStyle(ButtonStyle.Link)
        .setURL(`${this.env.auth.baseUrl}/auth/login/discord`),
    )

    const content =
      session === null
        ? 'Você precisa conectar sua conta antes de usar este comando.\nUse `/login` ou clique no botão abaixo:'
        : 'Sua sessão expirou. Use `/login` ou clique no botão abaixo para reconectar:'

    if (interaction.isRepliable()) {
      await interaction.reply({
        content,
        components: [row],
        flags: MessageFlags.Ephemeral,
      })
    }
  }

  async handleLoginCommand(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    // Defer immediately before any async DB call to avoid the 3s Discord timeout (TAS-56).
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    const session = await this.resolveActiveSession(interaction.user.id)
    if (session?.hasSession) {
      await interaction.editReply(
        'Você já está logado! Use `/logout` para encerrar sua sessão.',
      )
      return
    }

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel('Login com Discord')
        .setStyle(ButtonStyle.Link)
        .setURL(`${this.loginUrl}`),
    )

    const content =
      session === null
        ? 'Você precisa conectar sua conta antes de usar este comando.\nUse `/login` ou clique no botão abaixo:'
        : 'Sua sessão expirou. Use `/login` ou clique no botão abaixo para reconectar:'

    await interaction.editReply({ content, components: [row] })
  }

  async handleLogoutCommand(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    // Defer immediately before any async DB calls to avoid the 3s Discord timeout (TAS-56).
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    const checkResult = await this.userRepository.hasActiveSession(
      interaction.user.id,
    )

    if (Result.isError(checkResult)) {
      await interaction.editReply(
        'Erro interno ao verificar sessão. Tente novamente.',
      )
      return
    }

    if (checkResult.value === null) {
      await interaction.editReply(
        'Você não está registrado no sistema. Use `/login` para conectar sua conta.',
      )
      return
    }

    if (!checkResult.value.hasSession) {
      await interaction.editReply(
        'Você não possui sessão ativa. Use `/login` para reconectar.',
      )
      return
    }

    const deleteResult = await this.userRepository.deleteSessionsByDiscordId(
      interaction.user.id,
    )

    if (Result.isError(deleteResult)) {
      await interaction.editReply('Erro ao encerrar sessão. Tente novamente.')
      return
    }

    await interaction.editReply(
      'Sessão encerrada com sucesso. Use `/login` quando quiser reconectar.',
    )
  }
}
