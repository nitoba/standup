import { describe, expect, it } from 'vitest'
import type { StandupRecord } from '../../../../shared/domain'
import { buildReviewEmbed } from './review.embed'

describe('buildReviewEmbed', () => {
  const record: StandupRecord = {
    id: 'std-1',
    userId: 'user-1',
    date: '2026-04-29',
    content: 'Conteúdo do standup',
    status: 'pending_review',
    meetingType: 'daily',
    sourceData: '{}',
    customEntries: null,
    dmMessageId: null,
    sentToDiscordAt: null,
    createdAt: 1745928000000,
    updatedAt: 1745928000000,
  }

  it('builds review embed with blue color and meeting type field', () => {
    const embed = buildReviewEmbed(record)
    expect(embed.color).toBe(0x3498db)
    expect(embed.title).toContain('Standup')
    expect(embed.fields?.find((f) => f.name === 'Tipo de Reunião')?.value).toBe(
      'daily',
    )
    expect(embed.fields?.find((f) => f.name === 'Status')?.value).toBe(
      'Pendente de Revisão',
    )
  })

  it('truncates description to 4096 chars', () => {
    const big = { ...record, content: 'x'.repeat(5000) }
    const embed = buildReviewEmbed(big)
    expect(embed.description).toBeDefined()
    expect(embed.description!.length).toBeLessThanOrEqual(4096)
  })
})
