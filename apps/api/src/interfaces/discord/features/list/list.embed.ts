// apps/api/src/interfaces/discord/features/list/list.embed.ts
import type { APIEmbed } from 'discord.js'
import {
  isIsoDate,
  toDisplayDateFromIso,
} from '../../../../platform/time/date-only'
import type { StandupRecord, StandupStatus } from '../../../../shared/domain'
import { EMBED_COLORS } from '../../embeds'

const STATUS_LABELS: Record<StandupStatus, string> = {
  draft: 'Rascunho',
  delivery_pending: 'Aguardando DM',
  pending_review: 'Pendente de Revisão',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
}

function standupStatusLabel(status: StandupStatus): string {
  return STATUS_LABELS[status]
}

function displayDate(value: string): string {
  return isIsoDate(value) ? toDisplayDateFromIso(value) : value
}

export function buildListEmbeds(payload: {
  items: StandupRecord[]
  page: number
  totalPages: number
  total: number
}): APIEmbed[] {
  return payload.items.map((record) => ({
    title: `Standup de ${displayDate(record.date)}`,
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
      text: `standup-bot | página ${payload.page}/${payload.totalPages || 1} | ${payload.total} standup(s)`,
    },
  }))
}
