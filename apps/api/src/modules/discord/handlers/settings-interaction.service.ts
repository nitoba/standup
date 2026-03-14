import { Injectable } from '@nestjs/common'
import {
  ActionRowBuilder,
  ButtonBuilder,
  type ButtonInteraction,
  ButtonStyle,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  type ModalSubmitInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js'
import { UserSettingsRepository } from '../../../shared/module/database/repositories/user-settings.repository'
import { DiscordAuthService } from '../services/discord-auth.service'
import { DiscordAvailableReposService } from '../services/discord-available-repos.service'

type SettingsRecord = {
  standupCron: string
  reminderCron: string
  recoveryCron: string
  timezone: string
  selectedRepos: string
  gitAuthor: string
  active: boolean
  snoozedUntil: number | null
  cancelledDate: string | null
}

@Injectable()
export class SettingsInteractionService {
  constructor(
    private readonly auth: DiscordAuthService,
    private readonly settingsRepository: UserSettingsRepository,
    private readonly availableRepos: DiscordAvailableReposService,
  ) {}

  async handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })
    void this.availableRepos.fetchAvailableRepos()

    const session = await this.auth.resolveActiveSession(interaction.user.id)
    if (!session?.hasSession) {
      await interaction.editReply(
        '❌ Sessão expirada ou usuário não registrado. Use `/login` para reconectar.',
      )
      return
    }

    const result = await this.settingsRepository.findByUserId(session.userId)
    if (result.isErr()) {
      await interaction.editReply('❌ Erro ao buscar configurações.')
      return
    }

    const editButton = new ButtonBuilder()
      .setCustomId('settings:edit')
      .setLabel(result.value ? 'Editar' : 'Configurar')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('⚙️')

    if (!result.value) {
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        editButton,
      )
      await interaction.editReply({
        content:
          '📋 Nenhuma configuração encontrada.\nClique no botão abaixo para configurar seus standups.',
        components: [row],
      })
      return
    }

    const toggleButton = new ButtonBuilder()
      .setCustomId('settings:toggle')
      .setLabel(result.value.active ? 'Desativar' : 'Ativar')
      .setStyle(result.value.active ? ButtonStyle.Danger : ButtonStyle.Success)

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      editButton,
      toggleButton,
    )

    await interaction.editReply({
      embeds: [this.buildSettingsEmbed(result.value)],
      components: [row],
    })
  }

  async handleButton(
    interaction: ButtonInteraction,
    action: 'edit' | 'toggle',
  ): Promise<void> {
    const session = await this.auth.resolveActiveSession(interaction.user.id)
    if (!session?.hasSession) {
      await interaction.reply({
        content:
          '❌ Sessão expirada ou usuário não registrado. Use `/login` para reconectar.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    if (action === 'edit') {
      const result = await this.settingsRepository.findByUserId(session.userId)
      const currentSettings = result.isOk() ? result.value : null
      const repos =
        this.availableRepos.getCachedRepos().length > 0
          ? this.availableRepos.getCachedRepos()
          : await this.availableRepos.fetchAvailableRepos()

      if (repos.length === 0) {
        await interaction.reply({
          content:
            '❌ Não foi possível carregar os repositórios agora. Tente novamente em alguns segundos.',
          flags: MessageFlags.Ephemeral,
        })
        return
      }

      await this.showSettingsModal(
        interaction,
        repos,
        currentSettings ?? undefined,
      )
      return
    }

    await interaction.deferUpdate()
    const findResult = await this.settingsRepository.findByUserId(
      session.userId,
    )
    if (findResult.isErr() || !findResult.value) {
      await interaction.editReply({
        content: '❌ Nenhuma configuração encontrada para alternar.',
        components: [],
      })
      return
    }

    const current = findResult.value
    const upsertResult = await this.settingsRepository.upsert({
      userId: session.userId,
      selectedRepos: current.selectedRepos,
      gitAuthor: current.gitAuthor,
      gitSincePeriod: current.gitSincePeriod,
      active: !current.active,
      standupCron: current.standupCron,
      reminderCron: current.reminderCron,
      recoveryCron: current.recoveryCron,
      timezone: current.timezone,
      emailTheme: current.emailTheme,
    })

    if (upsertResult.isErr()) {
      await interaction.editReply({
        content: '❌ Erro ao alternar estado.',
        components: [],
      })
      return
    }

    await interaction.editReply({
      content: upsertResult.value.active
        ? '✅ Standup automático **ativado**!'
        : '⏸️ Standup automático **desativado**.',
      embeds: [this.buildSettingsEmbed(upsertResult.value)],
      components: [],
    })
  }

  async handleModal(interaction: ModalSubmitInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    const session = await this.auth.resolveActiveSession(interaction.user.id)
    if (!session?.hasSession) {
      await interaction.editReply(
        '❌ Sessão expirada ou usuário não registrado. Use `/login` para reconectar.',
      )
      return
    }

    const cronConfig = interaction.fields
      .getTextInputValue('cron-config')
      .trim()
    const timezone = interaction.fields.getTextInputValue('timezone').trim()
    const gitAuthor = interaction.fields.getTextInputValue('git-author').trim()

    const selectedReposRaw =
      'getStringSelectValues' in interaction.fields
        ? interaction.fields.getStringSelectValues('selected-repos')
        : []

    const cronLines = cronConfig
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    if (cronLines.length !== 3) {
      await interaction.editReply(
        '❌ Informe exatamente 3 linhas de cron: standup, reminder e recovery.',
      )
      return
    }

    if (!gitAuthor) {
      await interaction.editReply(
        '❌ O campo "Email do autor git" é obrigatório.',
      )
      return
    }

    const [standupCron, reminderCron, recoveryCron] = cronLines
    const upsertResult = await this.settingsRepository.upsert({
      userId: session.userId,
      standupCron,
      reminderCron,
      recoveryCron,
      timezone,
      selectedRepos: JSON.stringify([...selectedReposRaw]),
      gitAuthor,
    })

    if (upsertResult.isErr()) {
      await interaction.editReply('❌ Erro ao salvar configurações.')
      return
    }

    await interaction.editReply({
      content: '✅ Configurações salvas com sucesso!',
      embeds: [this.buildSettingsEmbed(upsertResult.value)],
    })
  }

  private async showSettingsModal(
    interaction: ButtonInteraction,
    availableRepos: Array<{ name: string; project: string }>,
    currentSettings?: Partial<SettingsRecord> | null,
  ): Promise<void> {
    const defaults = {
      standupCron: '30 17 * * 1-5',
      reminderCron: '20 17 * * 1-5',
      recoveryCron: '0 18 * * 1-5',
      timezone: 'America/Sao_Paulo',
      selectedRepos: '[]',
      gitAuthor: '',
    }

    const values = { ...defaults, ...currentSettings }
    let currentSelected: string[] = []

    try {
      const parsed = JSON.parse(values.selectedRepos)
      if (Array.isArray(parsed)) {
        currentSelected = parsed.filter(
          (repo): repo is string => typeof repo === 'string',
        )
      }
    } catch {
      currentSelected = []
    }

    const cronInput = new TextInputBuilder()
      .setCustomId('cron-config')
      .setLabel('Crons (standup, reminder, recovery)')
      .setValue(
        [values.standupCron, values.reminderCron, values.recoveryCron].join(
          '\n',
        ),
      )
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(200)

    const timezoneInput = new TextInputBuilder()
      .setCustomId('timezone')
      .setLabel('Fuso horário (ex: America/Sao_Paulo)')
      .setValue(values.timezone)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(50)

    const gitAuthorInput = new TextInputBuilder()
      .setCustomId('git-author')
      .setLabel('Email do autor git')
      .setValue(values.gitAuthor)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(100)

    const repoOptions = availableRepos
      .slice(0, 25)
      .map((repo) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(`${repo.project}/${repo.name}`.slice(0, 100))
          .setValue(repo.name.slice(0, 100))
          .setDescription(`Projeto: ${repo.project}`.slice(0, 100))
          .setDefault(currentSelected.includes(repo.name)),
      )

    const reposSelect = new StringSelectMenuBuilder()
      .setCustomId('selected-repos')
      .setPlaceholder('Selecione os repositórios a analisar')
      .setMinValues(1)
      .setMaxValues(Math.min(repoOptions.length, 25))
      .setRequired(true)
      .addOptions(repoOptions)

    const reposLabel = new LabelBuilder()
      .setLabel('Repositórios a analisar')
      .setDescription('Selecione um ou mais repositórios da Azure DevOps')
      .setStringSelectMenuComponent(reposSelect)

    const modal = new ModalBuilder()
      .setCustomId('settings-modal:edit')
      .setTitle('Configurações de Standup')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(cronInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(timezoneInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(gitAuthorInput),
      )
      .addLabelComponents(reposLabel)

    await interaction.showModal(modal)
  }

  private buildSettingsEmbed(settings: SettingsRecord): EmbedBuilder {
    const statusParts: string[] = []
    if (settings.snoozedUntil && settings.snoozedUntil > Date.now()) {
      const until = new Date(settings.snoozedUntil).toLocaleTimeString('pt-BR')
      statusParts.push(`⏸️ Snoozed até ${until}`)
    }
    if (settings.cancelledDate) {
      statusParts.push(`🚫 Cancelado em ${settings.cancelledDate}`)
    }

    let reposDisplay = '`(nenhum selecionado)`'
    try {
      const parsed = JSON.parse(settings.selectedRepos)
      if (Array.isArray(parsed) && parsed.length > 0) {
        reposDisplay = parsed
          .filter((repo): repo is string => typeof repo === 'string')
          .map((repo) => `\`${repo}\``)
          .join(', ')
      }
    } catch {
      reposDisplay = '`(inválido)`'
    }

    const embed = new EmbedBuilder()
      .setTitle('⚙️ Configurações de Standup')
      .setColor(settings.active ? 0x3498db : 0x95a5a6)
      .addFields(
        {
          name: 'Standup Cron',
          value: `\`${settings.standupCron}\``,
          inline: true,
        },
        {
          name: 'Reminder Cron',
          value: `\`${settings.reminderCron}\``,
          inline: true,
        },
        {
          name: 'Recovery Cron',
          value: `\`${settings.recoveryCron}\``,
          inline: true,
        },
        { name: 'Timezone', value: settings.timezone, inline: true },
        { name: 'Git Author', value: settings.gitAuthor, inline: true },
        { name: 'Repositórios', value: reposDisplay, inline: false },
        {
          name: 'Status',
          value: settings.active ? '✅ Ativo' : '❌ Inativo',
          inline: true,
        },
      )

    if (statusParts.length > 0) {
      embed.addFields({
        name: 'Observações',
        value: statusParts.join('\n'),
      })
    }

    return embed
  }
}
