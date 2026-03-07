import { resolveReposScanPath } from '@standup/config'
import { getDb, UserRepository, UserSettingsRepository } from '@standup/db'
import {
  ActionRowBuilder,
  ButtonBuilder,
  type ButtonInteraction,
  ButtonStyle,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js'

export interface SettingsHandlerDeps {
  databaseUrl: string
  reposRootPath: string
}

/**
 * /standup settings — View standup configuration and offer edit via modal.
 *
 * Shows current settings in an ephemeral embed with an "Editar" button.
 * If no settings exist, shows a "Configurar" button to open the setup modal.
 */
export async function handleSettings(
  interaction: ChatInputCommandInteraction,
  deps: SettingsHandlerDeps,
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const discordId = interaction.user.id
  const db = getDb(deps.databaseUrl)
  const userRepo = new UserRepository(db)
  const settingsRepo = new UserSettingsRepository(db)

  const userResult = userRepo.findByDiscordId(discordId)
  if (userResult.isErr() || !userResult.value) {
    await interaction.editReply({
      content: '❌ Não foi possível resolver seu usuário.',
    })
    return
  }

  const userId = userResult.value.id
  const result = settingsRepo.findByUserId(userId)

  if (result.isErr()) {
    await interaction.editReply({
      content: '❌ Erro ao buscar configurações.',
    })
    return
  }

  const editButton = new ButtonBuilder()
    .setCustomId('settings:edit')
    .setLabel(result.value ? 'Editar' : 'Configurar')
    .setStyle(ButtonStyle.Primary)
    .setEmoji('⚙️')

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(editButton)

  if (!result.value) {
    await interaction.editReply({
      content:
        '📋 Nenhuma configuração encontrada.\nClique no botão abaixo para configurar seus standups.',
      components: [row],
    })
    return
  }

  const settings = result.value

  const toggleButton = new ButtonBuilder()
    .setCustomId('settings:toggle')
    .setLabel(settings.active ? 'Desativar' : 'Ativar')
    .setStyle(settings.active ? ButtonStyle.Danger : ButtonStyle.Success)

  const rowWithToggle = new ActionRowBuilder<ButtonBuilder>().addComponents(
    editButton,
    toggleButton,
  )

  await interaction.editReply({
    embeds: [buildSettingsEmbed(settings, deps.reposRootPath)],
    components: [rowWithToggle],
  })
}

/**
 * Opens the settings modal pre-filled with current values (or defaults).
 * Discord modals support max 5 ActionRows (TextInputs).
 *
 * Fields:
 * 1. Crons (3 linhas: standup, reminder, recovery)
 * 2. Timezone
 * 3. Repos Subpath
 * 4. Git Author
 * 5. Git Since Period
 */
export function showSettingsModal(
  interaction: ButtonInteraction,
  currentSettings?: {
    standupCron: string
    reminderCron: string
    recoveryCron: string
    timezone: string
    reposBasePath: string
    gitAuthor: string
    gitSincePeriod: string
  } | null,
  reposRootPath = '/repos',
): Promise<void> {
  const defaults = {
    standupCron: '30 17 * * 1-5',
    reminderCron: '20 17 * * 1-5',
    recoveryCron: '0 18 * * 1-5',
    timezone: 'America/Sao_Paulo',
    reposBasePath: '',
    gitAuthor: '',
    gitSincePeriod: '16 hours ago',
  }

  const resolvedCurrentRepos =
    currentSettings !== null && currentSettings !== undefined
      ? resolveReposScanPath(currentSettings.reposBasePath, reposRootPath)
      : null

  const values = currentSettings
    ? {
        ...currentSettings,
        reposBasePath:
          resolvedCurrentRepos?.isOk() === true
            ? resolvedCurrentRepos.value.normalizedSubpath
            : currentSettings.reposBasePath,
      }
    : defaults

  const cronInput = new TextInputBuilder()
    .setCustomId('cron-config')
    .setLabel('Crons (standup, reminder, recovery)')
    .setValue(
      [values.standupCron, values.reminderCron, values.recoveryCron].join('\n'),
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

  const reposPathInput = new TextInputBuilder()
    .setCustomId('repos-path')
    .setLabel('Subcaminho dos repositórios')
    .setValue(values.reposBasePath)
    .setPlaceholder('ibs/repos (vazio = usar o root inteiro)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(200)

  const gitAuthorInput = new TextInputBuilder()
    .setCustomId('git-author')
    .setLabel('Email do autor git')
    .setValue(values.gitAuthor)
    .setPlaceholder('seu.email@empresa.com')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100)

  const gitSinceInput = new TextInputBuilder()
    .setCustomId('git-since-period')
    .setLabel('Período de busca git (ex: 16 hours ago)')
    .setValue(values.gitSincePeriod)
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(50)

  const modal = new ModalBuilder()
    .setCustomId('settings-modal:edit')
    .setTitle('Configurações de Standup')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(cronInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(timezoneInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(reposPathInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(gitAuthorInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(gitSinceInput),
    )

  return interaction.showModal(modal)
}

export function buildSettingsEmbed(
  settings: {
    standupCron: string
    reminderCron: string
    recoveryCron: string
    timezone: string
    reposBasePath: string
    gitAuthor: string
    gitSincePeriod: string
    active: boolean
    snoozedUntil: number | null
    cancelledDate: string | null
  },
  reposRootPath: string,
): EmbedBuilder {
  const statusParts: string[] = []
  if (settings.snoozedUntil && settings.snoozedUntil > Date.now()) {
    const until = new Date(settings.snoozedUntil).toLocaleTimeString('pt-BR')
    statusParts.push(`⏸️ Snoozed até ${until}`)
  }
  if (settings.cancelledDate) {
    statusParts.push(`🚫 Cancelado em ${settings.cancelledDate}`)
  }

  const resolvedRepos = resolveReposScanPath(
    settings.reposBasePath,
    reposRootPath,
  )
  if (resolvedRepos.isErr()) {
    statusParts.push('⚠️ Subcaminho inválido. Edite e salve novamente.')
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
      {
        name: 'Repos Root',
        value: `\`${reposRootPath}\``,
        inline: true,
      },
      {
        name: 'Repos Subpath',
        value:
          resolvedRepos.isOk() && resolvedRepos.value.normalizedSubpath
            ? `\`${resolvedRepos.value.normalizedSubpath}\``
            : '`(root)`',
        inline: true,
      },
      { name: 'Git Author', value: settings.gitAuthor, inline: true },
      { name: 'Git Since', value: settings.gitSincePeriod, inline: true },
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
