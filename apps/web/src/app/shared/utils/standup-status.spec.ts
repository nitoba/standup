import { describe, expect, it } from 'vitest'

import {
  canRegenerateStandup,
  formatStandupStatus,
  getStandupStatusBadgeClass,
  getStandupStatusDotClass,
  getStandupStatusTextClass,
  isApprovedStandup,
  isPendingReviewStandup,
  normalizeStandupStatus,
} from './standup-status'

describe('standup-status', () => {
  it('returns the canonical mapping for every supported status', () => {
    expect(formatStandupStatus('draft')).toBe('[rascunho]')
    expect(getStandupStatusDotClass('draft')).toBe('bg-muted-foreground/50')
    expect(getStandupStatusTextClass('draft')).toBe('text-muted-foreground')
    expect(getStandupStatusBadgeClass('draft')).toBe('text-muted-foreground')

    expect(formatStandupStatus('pending_review')).toBe('[pendente]')
    expect(getStandupStatusDotClass('pending_review')).toBe(
      'bg-[var(--accent-yellow)]',
    )
    expect(getStandupStatusTextClass('pending_review')).toBe(
      'text-[var(--accent-yellow)]',
    )
    expect(getStandupStatusBadgeClass('pending_review')).toBe(
      'text-[var(--accent-yellow)]',
    )

    expect(formatStandupStatus('approved')).toBe('[aprovado]')
    expect(getStandupStatusDotClass('approved')).toBe('bg-primary')
    expect(getStandupStatusTextClass('approved')).toBe('text-primary')
    expect(getStandupStatusBadgeClass('approved')).toBe('text-primary')

    expect(formatStandupStatus('rejected')).toBe('[rejeitado]')
    expect(getStandupStatusDotClass('rejected')).toBe('bg-[var(--accent-red)]')
    expect(getStandupStatusTextClass('rejected')).toBe(
      'text-[var(--accent-red)]',
    )
    expect(getStandupStatusBadgeClass('rejected')).toBe(
      'text-[var(--accent-red)]',
    )

    expect(formatStandupStatus('published')).toBe('[publicado]')
    expect(getStandupStatusDotClass('published')).toBe('bg-cyan-400')
    expect(getStandupStatusTextClass('published')).toBe('text-cyan-400')
    expect(getStandupStatusBadgeClass('published')).toBe('text-cyan-400')
  })

  it('returns the expected status predicates', () => {
    expect(isPendingReviewStandup('pending_review')).toBe(true)
    expect(isApprovedStandup('approved')).toBe(true)
    expect(isApprovedStandup('published')).toBe(false)
    expect(canRegenerateStandup('pending_review')).toBe(true)
    expect(canRegenerateStandup('rejected')).toBe(true)
    expect(canRegenerateStandup('approved')).toBe(false)
    expect(canRegenerateStandup('published')).toBe(false)
  })

  it('normalizes raw string statuses into canonical StandupStatus values', () => {
    expect(normalizeStandupStatus('draft')).toBe('draft')
    expect(normalizeStandupStatus('pending_review')).toBe('pending_review')
    expect(normalizeStandupStatus('approved')).toBe('approved')
    expect(normalizeStandupStatus('rejected')).toBe('rejected')
    expect(normalizeStandupStatus('published')).toBe('published')
    expect(normalizeStandupStatus('unknown-status')).toBe('pending_review')
  })
})
