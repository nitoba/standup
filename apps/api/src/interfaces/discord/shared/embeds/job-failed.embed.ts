import type { APIEmbed } from 'discord.js'
import { EMBED_COLORS } from './colors'
import { LIMITS, truncate } from './internal'

export function buildJobFailedEmbed(
  errorMessage: string,
  context = 'standup-job',
): APIEmbed {
  return {
    title: truncate('Job de Standup Falhou', LIMITS.TITLE),
    color: EMBED_COLORS.REJECTED,
    description: truncate(errorMessage, LIMITS.DESCRIPTION),
    fields: [
      {
        name: 'Contexto',
        value: truncate(context, LIMITS.FIELD_VALUE),
        inline: true,
      },
    ],
    footer: {
      text: truncate(
        'standup-bot | Verifique os logs para detalhes',
        LIMITS.FOOTER,
      ),
    },
    timestamp: new Date().toISOString(),
  }
}
