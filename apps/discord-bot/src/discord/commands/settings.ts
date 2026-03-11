import { getDb, UserRepository, UserSettingsRepository } from '@standup/db'
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
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js'
import {
  fetchAvailableRepos,
  type RepoInfo,
} from '../../services/fetch-available-repos.js'

export interface SettingsHandlerDeps {
  databaseUrl: string
  workerInternalUrl: string
  internalSecret: string
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

  // Pre-warm the repos cache while we have 15 minutes (deferred reply).
  // This way, when the user clicks "Editar", getCachedRepos() returns instantly
  // and the button handler can call showModal() within Discord's 3s limit.
  void fetchAvailableRepos({
    workerInternalUrl: deps.workerInternalUrl,
    internalSecret: deps.internalSecret,
  })

  const discordId = interaction.user.id
  const db = getDb(deps.databaseUrl)
  const userRepo = new UserRepository(db)
  const settingsRepo = new UserSettingsRepository(db)

  const userResult = await userRepo.hasActiveSession(discordId)
  if (userResult.isErr() || !userResult.value || !userResult.value.hasSession) {
    await interaction.editReply({
      content:
        '❌ Sessão expirada ou usuário não registrado. Use `/login` para reconectar.',
    })
    return
  }

  const userId = userResult.value.userId
  const result = await settingsRepo.findByUserId(userId)

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
    embeds: [buildSettingsEmbed(settings)],
    components: [rowWithToggle],
  })
}

/**
 * Opens the settings modal pre-filled with current values (or defaults).
 *
 * Fields:
 * 1. Crons (3 linhas: standup, reminder, recovery)
 * 2. Timezone
 * 3. Git Author
 * 4. Git Since Period
 * 5. Repositórios selecionados (StringSelect multi-select)
 */
export async function showSettingsModal(
  interaction: ButtonInteraction,
  availableRepos: RepoInfo[],
  currentSettings?: {
    standupCron: string
    reminderCron: string
    recoveryCron: string
    timezone: string
    selectedRepos: string
    gitAuthor: string
  } | null,
): Promise<void> {
  const defaults = {
    standupCron: '30 17 * * 1-5',
    reminderCron: '20 17 * * 1-5',
    recoveryCron: '0 18 * * 1-5',
    timezone: 'America/Sao_Paulo',
    selectedRepos: '[]',
    gitAuthor: '',
  }

  const values = currentSettings ?? defaults

  // Parse currently selected repo names
  let currentSelected: string[] = []
  try {
    const parsed = JSON.parse(values.selectedRepos)
    if (Array.isArray(parsed)) {
      currentSelected = parsed.filter((r): r is string => typeof r === 'string')
    }
  } catch {
    currentSelected = []
  }

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

  const gitAuthorInput = new TextInputBuilder()
    .setCustomId('git-author')
    .setLabel('Email do autor git')
    .setValue(values.gitAuthor)
    .setPlaceholder('seu.email@empresa.com')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100)

  // Build the repos select menu
  // Discord limits: 25 options per select, option label max 100 chars, value max 100 chars
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

  return interaction.showModal(modal)
}

export function buildSettingsEmbed(settings: {
  standupCron: string
  reminderCron: string
  recoveryCron: string
  timezone: string
  selectedRepos: string
  gitAuthor: string
  active: boolean
  snoozedUntil: number | null
  cancelledDate: string | null
}): EmbedBuilder {
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
        .filter((r): r is string => typeof r === 'string')
        .map((r) => `\`${r}\``)
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
      {
        name: 'Repositórios',
        value: reposDisplay,
        inline: false,
      },
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
