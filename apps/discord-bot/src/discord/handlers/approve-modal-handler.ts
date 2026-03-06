import type { BotEnv } from '@standup/config'
import { getDb, StandupRepository } from '@standup/db'
import type { CustomEntries } from '@standup/domain'
import { hasCustomEntries, mergeCustomEntries } from '@standup/domain'
import { createServiceLogger, withContext } from '@standup/logger'
import type { Client, ModalSubmitInteraction } from 'discord.js'
import { handleStandupInteraction } from './interaction-handler.js'

const logger = createServiceLogger({
  service: 'discord-bot',
  component: 'approve-modal-handler',
})

/**
 * Parses a multi-line text input into an array of non-empty trimmed strings.
 */
function parseLines(raw: string): string[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

/**
 * Handles the approve modal submission.
 *
 * Flow:
 * 1. Parse standupId from customId (standup-approve-modal:<standupId>)
 * 2. Extract optional scheduled meetings and direct calls from text inputs
 * 3. Defer the update (acknowledge to Discord)
 * 4. If custom entries provided: save to DB and merge into content
 * 5. Run the approve flow via handleStandupInteraction
 * 6. Edit the original message with feedback
 */
export async function handleApproveModal(
  interaction: ModalSubmitInteraction,
  client: Client,
  env: Pick<BotEnv, 'DATABASE_URL' | 'DISCORD_CHANNEL_ID'>,
): Promise<void> {
  const [namespace, standupId] = interaction.customId.split(':')
  if (namespace !== 'standup-approve-modal' || !standupId) return

  const scheduledMeetingsRaw =
    interaction.fields.getTextInputValue('scheduled-meetings')?.trim() || ''
  const directCallsRaw =
    interaction.fields.getTextInputValue('direct-calls')?.trim() || ''

  const modalLogger = withContext(logger, {
    standupId,
    userId: interaction.user.id,
    hasScheduledMeetings: !!scheduledMeetingsRaw,
    hasDirectCalls: !!directCallsRaw,
  })
  modalLogger.info('Approve modal submitted')

  await interaction.deferUpdate()

  // Parse custom entries from modal fields
  const entries: CustomEntries = {
    scheduledMeetings: parseLines(scheduledMeetingsRaw),
    directCalls: parseLines(directCallsRaw),
  }

  // If custom entries are provided, persist them and merge into content
  if (hasCustomEntries(entries)) {
    const db = getDb(env.DATABASE_URL)
    const repo = new StandupRepository(db)

    // Save custom entries to the dedicated column
    const saveResult = await repo.updateCustomEntries(standupId, entries)
    if (saveResult.isErr()) {
      modalLogger.error('Failed to save custom entries', {
        error: saveResult.error.message,
      })
      await interaction.editReply({
        content: `\u{274C} Erro ao salvar entradas customizadas: ${saveResult.error.message}`,
        components: [],
      })
      return
    }

    // Merge custom entries into the content
    const record = saveResult.value
    const mergedContent = mergeCustomEntries(
      record.content,
      record.meetingType,
      entries,
    )

    // Update the content with merged text
    const contentResult = await repo.updateContent(standupId, mergedContent)
    if (contentResult.isErr()) {
      modalLogger.error('Failed to update content with custom entries', {
        error: contentResult.error.message,
      })
      await interaction.editReply({
        content: `\u{274C} Erro ao atualizar conteudo: ${contentResult.error.message}`,
        components: [],
      })
      return
    }

    modalLogger.info('Custom entries merged into content', {
      scheduledMeetings: entries.scheduledMeetings.length,
      directCalls: entries.directCalls.length,
    })
  }

  // Run the standard approve flow (updateStatus + publish)
  const result = await handleStandupInteraction(
    'approve',
    standupId,
    {
      databaseUrl: env.DATABASE_URL,
      discordChannelId: env.DISCORD_CHANNEL_ID,
    },
    client,
  )

  if (result.isOk()) {
    modalLogger.info('Standup approved via modal', {
      outcome: result.value.action,
    })

    const entriesMsg = hasCustomEntries(entries)
      ? '\nEntradas adicionadas ao standup.'
      : ''

    await interaction.editReply({
      content: `\u{2705} ${result.value.message}${entriesMsg}`,
      components: [],
    })
  } else {
    modalLogger.error('Approve failed', {
      error: result.error.message,
    })
    await interaction.editReply({
      content: `\u{274C} Erro ao aprovar: ${result.error.message}`,
      components: [],
    })
  }
}
