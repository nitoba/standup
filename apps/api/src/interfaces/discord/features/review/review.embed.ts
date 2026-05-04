import type { APIEmbed } from 'discord.js'
import type { StandupRecord } from '../../../../shared/domain'
import { EMBED_COLORS } from '../../shared/embeds'
import { displayDate, LIMITS, truncate } from '../../shared/embeds/internal'

export { EMBED_COLORS }

export function buildReviewEmbed(record: StandupRecord): APIEmbed {
  return {
    title: truncate(`Standup de ${displayDate(record.date)}`, LIMITS.TITLE),
    color: EMBED_COLORS.REVIEW,
    description: truncate(record.content, LIMITS.DESCRIPTION),
    fields: [
      {
        name: 'Tipo de Reunião',
        value: truncate(record.meetingType || 'daily', LIMITS.FIELD_VALUE),
        inline: true,
      },
      {
        name: 'Status',
        value: 'Pendente de Revisão',
        inline: true,
      },
    ],
    footer: {
      text: truncate(
        'standup-bot | Use os botões abaixo para revisar',
        LIMITS.FOOTER,
      ),
    },
    timestamp: new Date(record.createdAt).toISOString(),
  }
}
