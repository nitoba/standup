import { getDb, StandupRepository } from '@standup/db'
import { DbError, NotFoundError, ValidationError } from '@standup/domain'
import { createServiceLogger, withContext } from '@standup/logger'
import { type ButtonInteraction, MessageFlags } from 'discord.js'

const logger = createServiceLogger({
  service: 'discord-bot',
  component: 'copy-handler',
})

export type CopyAction = 'content'

export interface CopyHandlerDeps {
  databaseUrl: string
}

function splitForDiscord(text: string, max = 2000): string[] {
  if (text.length <= max) return [text]

  const chunks: string[] = []
  let remaining = text

  while (remaining.length > max) {
    const breakAt = remaining.lastIndexOf('\n', max)
    const index = breakAt > 0 ? breakAt : max
    chunks.push(remaining.slice(0, index))
    remaining = remaining.slice(index).trimStart()
  }

  if (remaining.length > 0) {
    chunks.push(remaining)
  }

  return chunks
}

/**
 * Envia o conteúdo do standup em texto puro (ephemeral), pronto para copiar.
 */
export async function handleCopyButtonInteraction(
  interaction: ButtonInteraction,
  action: CopyAction,
  standupId: string,
  deps: CopyHandlerDeps,
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  if (action !== 'content') {
    await interaction.editReply('❌ Acao de copia desconhecida.')
    return
  }

  const actionLogger = withContext(logger, {
    standupId,
    action,
    userId: interaction.user.id,
  })

  const db = getDb(deps.databaseUrl)
  const repo = new StandupRepository(db)

  const found = await repo.findById(standupId)
  if (found.isErr()) {
    const message = NotFoundError.is(found.error)
      ? 'Standup nao encontrado para copia.'
      : `Erro ao buscar standup: ${found.error.message}`

    actionLogger.warn('Failed to load standup for copy', {
      error: found.error.message,
    })
    await interaction.editReply(`❌ ${message}`)
    return
  }

  const content = found.value.content?.trim()
  if (!content) {
    await interaction.editReply('❌ Standup sem conteudo para copiar.')
    return
  }

  const chunks = splitForDiscord(content)
  await interaction.editReply(chunks[0] ?? content)

  for (const chunk of chunks.slice(1)) {
    await interaction.followUp({
      content: chunk,
      flags: MessageFlags.Ephemeral,
    })
  }

  actionLogger.info('Standup content sent for copy', {
    chunkCount: chunks.length,
    contentLength: content.length,
  })
}

export type CopyHandlerError = DbError | NotFoundError | ValidationError
