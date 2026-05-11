import type { APIEmbed } from 'discord.js'
import { EMBED_COLORS } from './colors'
import { LIMITS, truncate } from './internal'

export function buildReminderEmbed(nextRunAt: string): APIEmbed {
  const runDate = new Date(nextRunAt)
  const timeStr = runDate.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })

  return {
    title: truncate('Lembrete de Standup', LIMITS.TITLE),
    color: EMBED_COLORS.WARNING,
    description: truncate(
      `O standup será gerado às **${timeStr}**. O que deseja fazer?`,
      LIMITS.DESCRIPTION,
    ),
    fields: [
      {
        name: 'Adiar 15min',
        value: 'Adia a geração em 15 minutos.',
        inline: true,
      },
      {
        name: 'Cancelar Hoje',
        value: 'Pula a geração de hoje.',
        inline: true,
      },
    ],
    footer: {
      text: truncate(
        'standup-bot | Use os botões abaixo para gerenciar',
        LIMITS.FOOTER,
      ),
    },
    timestamp: new Date().toISOString(),
  }
}
