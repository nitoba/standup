import {
  type BotEnv,
  normalizeReposSubpath,
  resolveReposScanPath,
} from '@standup/config'
import { getDb, UserRepository, UserSettingsRepository } from '@standup/db'
import { createServiceLogger, withContext } from '@standup/logger'
import { MessageFlags, type ModalSubmitInteraction } from 'discord.js'
import { buildSettingsEmbed } from '../commands/settings.js'

const logger = createServiceLogger({
  service: 'discord-bot',
  component: 'settings-modal-handler',
})

/**
 * Handles the settings modal submission (customId: settings-modal:edit).
 *
 * Flow:
 * 1. Resolve internal userId from Discord ID
 * 2. Extract field values from the modal
 * 3. Upsert settings to DB
 * 4. Reply with updated settings embed
 */
export async function handleSettingsModal(
  interaction: ModalSubmitInteraction,
  env: Pick<BotEnv, 'DATABASE_URL' | 'REPOS_ROOT_PATH'>,
): Promise<void> {
  if (interaction.customId !== 'settings-modal:edit') return

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const discordId = interaction.user.id
  const db = getDb(env.DATABASE_URL)
  const userRepo = new UserRepository(db)
  const settingsRepo = new UserSettingsRepository(db)

  const modalLogger = withContext(logger, { discordId })

  const userResult = userRepo.findByDiscordId(discordId)
  if (userResult.isErr() || !userResult.value) {
    modalLogger.error('Failed to resolve user', {
      error: userResult.isErr() ? userResult.error.message : 'not found',
    })
    await interaction.editReply({
      content: '❌ Não foi possível resolver seu usuário.',
    })
    return
  }

  const userId = userResult.value.id

  const cronConfig = interaction.fields.getTextInputValue('cron-config').trim()
  const timezone = interaction.fields.getTextInputValue('timezone').trim()
  const reposBasePathRaw = interaction.fields
    .getTextInputValue('repos-path')
    .trim()
  const gitAuthor = interaction.fields.getTextInputValue('git-author').trim()
  const gitSincePeriod = interaction.fields
    .getTextInputValue('git-since-period')
    .trim()

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

  const reposBasePath = reposBasePathRaw.startsWith(env.REPOS_ROOT_PATH)
    ? reposBasePathRaw
    : reposBasePathRaw.replace(/^[\\/]+/, '')

  const resolvedReposPath = resolveReposScanPath(
    reposBasePath,
    env.REPOS_ROOT_PATH,
  )
  if (resolvedReposPath.isErr()) {
    await interaction.editReply({
      content: `❌ ${resolvedReposPath.error.message}`,
    })
    return
  }

  const normalizedReposSubpath = normalizeReposSubpath(
    resolvedReposPath.value.normalizedSubpath,
  )
  if (normalizedReposSubpath.isErr()) {
    await interaction.editReply({
      content: `❌ ${normalizedReposSubpath.error.message}`,
    })
    return
  }

  modalLogger.info('Settings modal submitted', {
    userId,
    standupCron,
    timezone,
  })

  const upsertResult = settingsRepo.upsert({
    userId,
    standupCron,
    reminderCron,
    recoveryCron,
    timezone,
    reposBasePath: normalizedReposSubpath.value,
    gitAuthor,
    gitSincePeriod,
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
    embeds: [buildSettingsEmbed(settings, env.REPOS_ROOT_PATH)],
  })

  modalLogger.info('Settings saved successfully', { userId })
}
