import { getDb, UserRepository, UserSettingsRepository } from '@standup/db'
import { createServiceLogger, withContext } from '@standup/logger'
import { MessageFlags, type ModalSubmitInteraction } from 'discord.js'
import { buildSettingsEmbed } from '../commands/settings.js'

const logger = createServiceLogger({
  service: 'discord-bot',
  component: 'settings-modal-handler',
})

interface SettingsModalDeps {
  databaseUrl: string
}

/**
 * Handles the settings modal submission (customId: settings-modal:edit).
 *
 * Flow:
 * 1. Resolve internal userId from Discord ID
 * 2. Extract field values from the modal (TextInputs + StringSelect for repos)
 * 3. Upsert settings to DB
 * 4. Reply with updated settings embed
 */
export async function handleSettingsModal(
  interaction: ModalSubmitInteraction,
  deps: SettingsModalDeps,
): Promise<void> {
  if (interaction.customId !== 'settings-modal:edit') return

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const discordId = interaction.user.id
  const db = getDb(deps.databaseUrl)
  const userRepo = new UserRepository(db)
  const settingsRepo = new UserSettingsRepository(db)

  const modalLogger = withContext(logger, { discordId })

  const userResult = await userRepo.hasActiveSession(discordId)
  if (userResult.isErr() || !userResult.value || !userResult.value.hasSession) {
    modalLogger.error('Failed to resolve user or session expired', {
      error: userResult.isErr() ? userResult.error.message : 'not found',
    })
    await interaction.editReply({
      content:
        '❌ Sessão expirada ou usuário não registrado. Use `/login` para reconectar.',
    })
    return
  }

  const userId = userResult.value.userId

  const cronConfig = interaction.fields.getTextInputValue('cron-config').trim()
  const timezone = interaction.fields.getTextInputValue('timezone').trim()
  const gitAuthor = interaction.fields.getTextInputValue('git-author').trim()

  // StringSelectMenu is submitted via getStringSelectValues
  const selectedReposRaw: readonly string[] = interaction.fields
    .getStringSelectValues
    ? interaction.fields.getStringSelectValues('selected-repos')
    : []

  const cronLines = cronConfig
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (cronLines.length !== 3) {
    await interaction.editReply({
      content:
        '❌ Informe exatamente 3 linhas de cron: standup, reminder e recovery.',
    })
    return
  }

  const [standupCron, reminderCron, recoveryCron] = cronLines

  if (!gitAuthor) {
    await interaction.editReply({
      content: '❌ O campo "Email do autor git" é obrigatório.',
    })
    return
  }

  const selectedRepos = JSON.stringify([...selectedReposRaw])

  modalLogger.info('Settings modal submitted', {
    userId,
    standupCron,
    timezone,
  })

  const upsertResult = await settingsRepo.upsert({
    userId,
    standupCron,
    reminderCron,
    recoveryCron,
    timezone,
    selectedRepos,
    gitAuthor,
  })

  if (upsertResult.isErr()) {
    modalLogger.error('Failed to upsert settings', {
      error: upsertResult.error.message,
    })
    await interaction.editReply({
      content: '❌ Erro ao salvar configurações.',
    })
    return
  }

  const settings = upsertResult.value

  await interaction.editReply({
    content: '✅ Configurações salvas com sucesso!',
    embeds: [buildSettingsEmbed(settings)],
  })

  modalLogger.info('Settings saved successfully', { userId })
}
