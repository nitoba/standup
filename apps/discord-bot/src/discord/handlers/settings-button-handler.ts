import { getDb, UserRepository, UserSettingsRepository } from '@standup/db'
import { createServiceLogger, withContext } from '@standup/logger'
import { type ButtonInteraction, MessageFlags } from 'discord.js'
import { buildSettingsEmbed, showSettingsModal } from '../commands/settings.js'

const logger = createServiceLogger({
  service: 'discord-bot',
  component: 'settings-button-handler',
})

export type SettingsButtonAction = 'edit' | 'toggle'

interface SettingsButtonDeps {
  databaseUrl: string
}

/**
 * Handles settings-related button interactions.
 *
 * - settings:edit → opens the settings modal (pre-filled with current values)
 * - settings:toggle → toggles active state in DB
 */
export async function handleSettingsButton(
  interaction: ButtonInteraction,
  action: string,
  deps: SettingsButtonDeps,
): Promise<void> {
  const discordId = interaction.user.id
  const db = getDb(deps.databaseUrl)
  const userRepo = new UserRepository(db)
  const settingsRepo = new UserSettingsRepository(db)

  const btnLogger = withContext(logger, { discordId, action })

  const userResult = userRepo.findByDiscordId(discordId)
  if (userResult.isErr() || !userResult.value) {
    btnLogger.error('Failed to resolve user')
    await interaction.reply({
      content: '❌ Não foi possível resolver seu usuário.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const userId = userResult.value.id

  if (action === 'edit') {
    const result = settingsRepo.findByUserId(userId)
    const currentSettings = result.isOk() ? result.value : null

    await showSettingsModal(interaction, currentSettings)
    return
  }

  if (action === 'toggle') {
    await interaction.deferUpdate()

    const findResult = settingsRepo.findByUserId(userId)
    if (findResult.isErr() || !findResult.value) {
      await interaction.editReply({
        content: '❌ Nenhuma configuração encontrada para alternar.',
        components: [],
      })
      return
    }

    const current = findResult.value
    const upsertResult = settingsRepo.upsert({
      userId,
      reposBasePath: current.reposBasePath,
      gitAuthor: current.gitAuthor,
      active: !current.active,
    })

    if (upsertResult.isErr()) {
      btnLogger.error('Failed to toggle active state', {
        error: upsertResult.error.message,
      })
      await interaction.editReply({
        content: '❌ Erro ao alternar estado.',
        components: [],
      })
      return
    }

    const updated = upsertResult.value
    btnLogger.info('Settings active state toggled', {
      userId,
      active: updated.active,
    })

    await interaction.editReply({
      content: updated.active
        ? '✅ Standup automático **ativado**!'
        : '⏸️ Standup automático **desativado**.',
      embeds: [buildSettingsEmbed(updated)],
      components: [],
    })
  }
}
