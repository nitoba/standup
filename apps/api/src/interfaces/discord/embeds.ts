import type { APIEmbed } from 'discord.js'
import { isIsoDate, toDisplayDateFromIso } from '../../platform/time/date-only'
import type { StandupRecord } from '../../shared/domain'

export const EMBED_COLORS = {
  REVIEW: 0x3498db,
  APPROVED: 0x2ecc71,
  REJECTED: 0xe74c3c,
  WARNING: 0xf39c12,
} as const

const LIMITS = {
  TITLE: 256,
  DESCRIPTION: 4096,
  FIELD_VALUE: 1024,
  FOOTER: 2048,
} as const

function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value
  }

  return `${value.slice(0, max - 3)}...`
}

function displayDate(value: string): string {
  return isIsoDate(value) ? toDisplayDateFromIso(value) : value
}

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
        name: 'Executar Agora',
        value: 'Gera o standup imediatamente.',
        inline: true,
      },
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

export function buildUserDmEmbed(
  title: string,
  message: string,
  color: number,
): APIEmbed {
  return {
    title: truncate(title, LIMITS.TITLE),
    color,
    description: truncate(message, LIMITS.DESCRIPTION),
    footer: {
      text: truncate('standup-bot', LIMITS.FOOTER),
    },
    timestamp: new Date().toISOString(),
  }
}

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
