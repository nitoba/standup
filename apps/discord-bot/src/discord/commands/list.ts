import { getDb, StandupRepository } from '@standup/db'
import type { StandupStatus } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import type { ChatInputCommandInteraction } from 'discord.js'
import { EMBED_COLORS } from '../embeds.js'

const logger = createServiceLogger({
  service: 'discord-bot',
  component: 'commands-list',
})

function standupStatusLabel(status: StandupStatus): string {
  const labels: Record<StandupStatus, string> = {
    draft: 'Draft',
    pending_review: 'Pendente de Revisão',
    approved: 'Aprovado',
    rejected: 'Rejeitado',
    published: 'Publicado',
  }
  return labels[status]
}

/**
 * Handler para /standup list.
 * Lista os últimos standups do DB com filtro opcional de status.
 * Padrão 13 do Akita: choices como dropdown nativo.
 */
export async function handleList(
  interaction: ChatInputCommandInteraction,
  deps: { databaseUrl: string },
): Promise<void> {
  const statusFilter = interaction.options.getString(
    'status',
  ) as StandupStatus | null

  logger.info('Received /standup list command', {
    userId: interaction.user.id,
    statusFilter,
  })

  await interaction.deferReply({ ephemeral: true })

  try {
    const db = getDb(deps.databaseUrl)
    const repo = new StandupRepository(db)

    const result = await repo.list(
      statusFilter ? { status: statusFilter } : undefined,
    )

    if (result.isErr()) {
      await interaction.editReply(
        `\u{274C} Erro ao buscar standups: ${result.error.message}`,
      )
      return
    }

    const records = result.value
    if (records.length === 0) {
      const filterMsg = statusFilter
        ? ` com status "${standupStatusLabel(statusFilter)}"`
        : ''
      await interaction.editReply(
        `\u{1F4ED} Nenhum standup encontrado${filterMsg}.`,
      )
      return
    }

    // Exibir até 10 standups como embeds (limite do Discord)
    const embeds = records.slice(0, 10).map((record) => ({
      title: `Standup de ${record.date}`,
      color: EMBED_COLORS.REVIEW,
      fields: [
        {
          name: 'Status',
          value: standupStatusLabel(record.status),
          inline: true,
        },
        {
          name: 'Tipo',
          value: record.meetingType || 'daily',
          inline: true,
        },
        {
          name: 'ID',
          value: `\`${record.id}\``,
          inline: false,
        },
      ],
      footer: {
        text: `standup-bot | ${records.length} standup(s) encontrado(s)`,
      },
    }))

    await interaction.editReply({ embeds })
  } catch (err) {
    await interaction.editReply(
      `\u{274C} Erro inesperado: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}
