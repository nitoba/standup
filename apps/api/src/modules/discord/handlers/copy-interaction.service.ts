import { Injectable } from '@nestjs/common'
import { type ButtonInteraction, MessageFlags } from 'discord.js'
import { StandupRepository } from '../../../shared/module/database/repositories/standup.repository'
import { NotFoundError } from '../../../shared/domain'
import { AppLoggerFactory } from '../../../shared/module/logger'

export type CopyAction = 'content'

function splitForDiscord(text: string, max = 2000): string[] {
  if (text.length <= max) {
    return [text]
  }

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

@Injectable()
export class CopyInteractionService {
  private readonly logger: ReturnType<AppLoggerFactory['create']>
  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly standupRepository: StandupRepository,
  ) {
    this.logger = this.loggerFactory.create('discord-copy-interaction')
  }

  async handle(
    interaction: ButtonInteraction,
    action: CopyAction,
    standupId: string,
  ): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    if (action !== 'content') {
      await interaction.editReply('❌ Ação de cópia desconhecida.')
      return
    }

    const found = await this.standupRepository.findById(standupId)
    if (found.isErr()) {
      const message = NotFoundError.is(found.error)
        ? 'Standup não encontrado para cópia.'
        : `Erro ao buscar standup: ${found.error.message}`

      this.logger.warn('Failed to load standup for copy', {
        standupId,
        error: found.error.message,
      })
      await interaction.editReply(`❌ ${message}`)
      return
    }

    const content = found.value.content.trim()
    if (!content) {
      await interaction.editReply('❌ Standup sem conteúdo para copiar.')
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
  }
}
