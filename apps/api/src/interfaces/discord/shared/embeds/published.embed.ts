import type { APIEmbed } from 'discord.js'
import type { StandupRecord } from '../../../../shared/domain'
import { EMBED_COLORS } from './colors'
import { displayDate, LIMITS, truncate } from './internal'

export function buildPublishedEmbed(record: StandupRecord): APIEmbed {
  return {
    title: truncate(`Standup — ${displayDate(record.date)}`, LIMITS.TITLE),
    color: EMBED_COLORS.APPROVED,
    description: truncate(record.content, LIMITS.DESCRIPTION),
    fields: [
      {
        name: 'Tipo de Reunião',
        value: truncate(record.meetingType || 'daily', LIMITS.FIELD_VALUE),
        inline: true,
      },
      {
        name: 'Status',
        value: 'Publicado ✓',
        inline: true,
      },
    ],
    footer: {
      text: truncate('standup-bot', LIMITS.FOOTER),
    },
    timestamp: new Date(record.updatedAt).toISOString(),
  }
}
