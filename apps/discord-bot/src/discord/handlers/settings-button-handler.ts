import { getDb, UserRepository, UserSettingsRepository } from '@standup/db'
import { createServiceLogger, withContext } from '@standup/logger'
import { type ButtonInteraction, MessageFlags } from 'discord.js'
import {
  fetchAvailableRepos,
  getCachedRepos,
} from '../../services/fetch-available-repos.js'
import { buildSettingsEmbed, showSettingsModal } from '../commands/settings.js'

const logger = createServiceLogger({
  service: 'discord-bot',
  component: 'settings-button-handler',
})

export type SettingsButtonAction = 'edit' | 'toggle'

interface SettingsButtonDeps {
  databaseUrl: string
  workerInternalUrl: string
  internalSecret: string
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

  const userResult = userRepo.hasActiveSession(discordId)
  if (userResult.isErr() || !userResult.value || !userResult.value.hasSession) {
    btnLogger.error('Failed to resolve user or session expired')
    await interaction.reply({
      content:
        '❌ Sessão expirada ou usuário não registrado. Use `/login` para reconectar.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const userId = userResult.value.userId

  if (action === 'edit') {
    const result = settingsRepo.findByUserId(userId)
    const currentSettings = result.isOk() ? result.value : null

    // Try cached repos first (instant, avoids 3s Discord timeout).
    // The cache is pre-warmed by handleSettings() when the user runs /standup settings.
    let availableRepos = getCachedRepos()

    if (availableRepos.length === 0) {
      // Cache miss — fall back to network call.
      // This may exceed 3s if MCP is slow, but it's the only option.
      btnLogger.warn('Repos cache empty, fetching from worker inline')
      const reposResult = await fetchAvailableRepos({
        workerInternalUrl: deps.workerInternalUrl,
        internalSecret: deps.internalSecret,
      })
      availableRepos = reposResult.isOk() ? reposResult.value : []
    }

    if (availableRepos.length === 0) {
      await interaction.reply({
        content:
          '❌ Nao foi possivel carregar a lista de repositorios. O worker pode estar indisponivel. Tente novamente em alguns segundos.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    await showSettingsModal(
      interaction,
      availableRepos,
      currentSettings ?? undefined,
    )
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
      selectedRepos: current.selectedRepos,
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
