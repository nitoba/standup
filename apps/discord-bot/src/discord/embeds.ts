import type { StandupRecord } from '@standup/domain'
import type { APIEmbed } from 'discord.js'

// ---------------------------------------------------------------------------
// Constantes de cor (decimal) — indicam status visualmente
// ---------------------------------------------------------------------------

export const EMBED_COLORS = {
  REVIEW: 0x3498db, // azul — pending_review
  APPROVED: 0x2ecc71, // verde — approved/published
  REJECTED: 0xe74c3c, // vermelho — rejected/error
  WARNING: 0xf39c12, // âmbar — warning/non-fatal
} as const

// ---------------------------------------------------------------------------
// Limites do Discord (do artigo do Akita)
// ---------------------------------------------------------------------------

const LIMITS = {
  TITLE: 256,
  DESCRIPTION: 4096,
  FIELD_VALUE: 1024,
  FOOTER: 2048,
} as const

function truncate(str: string, max: number): string {
  if (str.length <= max) return str
  return `${str.slice(0, max - 3)}...`
}

// ---------------------------------------------------------------------------
// Embeds
// ---------------------------------------------------------------------------

/**
 * Embed azul para DM de revisão (Padrão 3 do Akita).
 * Exibido quando o worker gera um novo standup e aguarda aprovação.
 */
export function buildReviewEmbed(record: StandupRecord): APIEmbed {
  const meetingType = record.meetingType || 'daily'

  return {
    title: truncate(`Standup de ${record.date}`, LIMITS.TITLE),
    color: EMBED_COLORS.REVIEW,
    description: truncate(record.content, LIMITS.DESCRIPTION),
    fields: [
      {
        name: 'Tipo de Reunião',
        value: truncate(meetingType, LIMITS.FIELD_VALUE),
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

/**
 * Embed verde para publicação no canal Discord (Padrão 3 do Akita).
 * Exibido quando um standup é aprovado e publicado.
 */
export function buildPublishedEmbed(record: StandupRecord): APIEmbed {
  const meetingType = record.meetingType || 'daily'

  return {
    title: truncate(`Standup — ${record.date}`, LIMITS.TITLE),
    color: EMBED_COLORS.APPROVED,
    description: truncate(record.content, LIMITS.DESCRIPTION),
    fields: [
      {
        name: 'Tipo de Reunião',
        value: truncate(meetingType, LIMITS.FIELD_VALUE),
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

/**
 * Embed vermelho para notificações de falha de job (Padrão 8 do Akita).
 * Enviado no canal Discord quando o worker falha.
 */
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
