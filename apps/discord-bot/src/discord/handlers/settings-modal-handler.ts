import type { BotEnv } from '@standup/config'
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
  env: Pick<BotEnv, 'DATABASE_URL'>,
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

  const standupCron = interaction.fields
    .getTextInputValue('standup-cron')
    .trim()
  const timezone = interaction.fields.getTextInputValue('timezone').trim()
  const reposBasePath = interaction.fields
    .getTextInputValue('repos-path')
    .trim()
  const gitAuthor = interaction.fields.getTextInputValue('git-author').trim()
  const gitSincePeriod = interaction.fields
    .getTextInputValue('git-since-period')
    .trim()

  if (!reposBasePath || !gitAuthor) {
    await interaction.editReply({
      content:
        '❌ Os campos "Caminho base dos repositórios" e "Email do autor git" são obrigatórios.',
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
    timezone,
    reposBasePath,
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
    embeds: [buildSettingsEmbed(settings)],
  })

  modalLogger.info('Settings saved successfully', { userId })
}
