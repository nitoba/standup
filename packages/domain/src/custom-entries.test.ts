import { describe, expect, it } from 'vitest'
import {
  formatCustomEntries,
  hasCustomEntries,
  mergeCustomEntries,
} from './custom-entries'

describe('hasCustomEntries', () => {
  it('returns false for null', () => {
    expect(hasCustomEntries(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(hasCustomEntries(undefined)).toBe(false)
  })

  it('returns false when both arrays are empty', () => {
    expect(hasCustomEntries({ scheduledMeetings: [], directCalls: [] })).toBe(
      false,
    )
  })

  it('returns true when scheduledMeetings has entries', () => {
    expect(
      hasCustomEntries({ scheduledMeetings: ['Planning'], directCalls: [] }),
    ).toBe(true)
  })

  it('returns true when directCalls has entries', () => {
    expect(
      hasCustomEntries({
        scheduledMeetings: [],
        directCalls: ['Call com Joao'],
      }),
    ).toBe(true)
  })
})

describe('formatCustomEntries', () => {
  it('formats scheduled meetings with calendar emoji', () => {
    const result = formatCustomEntries({
      scheduledMeetings: ['Planning Backend'],
      directCalls: [],
    })
    expect(result).toBe('\u{1F4C6} (Planning Backend)')
  })

  it('formats direct calls with phone emoji', () => {
    const result = formatCustomEntries({
      scheduledMeetings: [],
      directCalls: ['Call com Joao sobre deploy'],
    })
    expect(result).toBe('\u{260E}\u{FE0F} Call com Joao sobre deploy')
  })

  it('places scheduled meetings before direct calls', () => {
    const result = formatCustomEntries({
      scheduledMeetings: ['Planning Backend', 'Refinamento mobile'],
      directCalls: ['Call com Joao'],
    })
    expect(result).toBe(
      '\u{1F4C6} (Planning Backend)\n\u{1F4C6} (Refinamento mobile)\n\u{260E}\u{FE0F} Call com Joao',
    )
  })

  it('skips empty/whitespace-only entries', () => {
    const result = formatCustomEntries({
      scheduledMeetings: ['Planning', '', '  '],
      directCalls: ['Call com Joao', ''],
    })
    expect(result).toBe('\u{1F4C6} (Planning)\n\u{260E}\u{FE0F} Call com Joao')
  })

  it('returns empty string when all entries are blank', () => {
    const result = formatCustomEntries({
      scheduledMeetings: ['', '  '],
      directCalls: [''],
    })
    expect(result).toBe('')
  })
})

describe('mergeCustomEntries', () => {
  const baseContent = [
    '**Standup (06/03/2026)**',
    '\u{1F4C6} (Planing Web)',
    '',
    '**\u{1F4CC} agrotrace-web**',
    '',
    '**\u{2705} Done:**',
    '\u{27A8} #1234 - Corrigir bug X',
  ].join('\n')

  it('returns original content when entries is null-like', () => {
    const entries = { scheduledMeetings: [], directCalls: [] }
    expect(
      mergeCustomEntries(baseContent, '\u{1F4C6} (Planing Web)', entries),
    ).toBe(baseContent)
  })

  it('inserts scheduled meetings after existing meetingType line', () => {
    const entries = {
      scheduledMeetings: ['Planning Backend'],
      directCalls: [],
    }
    const result = mergeCustomEntries(
      baseContent,
      '\u{1F4C6} (Planing Web)',
      entries,
    )

    const lines = result.split('\n')
    // Line 0: **Standup (06/03/2026)**
    // Line 1: 📆 (Planing Web)
    // Line 2: 📆 (Planning Backend)  <-- inserted
    // Line 3: (empty)
    expect(lines[0]).toBe('**Standup (06/03/2026)**')
    expect(lines[1]).toBe('\u{1F4C6} (Planing Web)')
    expect(lines[2]).toBe('\u{1F4C6} (Planning Backend)')
    expect(lines[3]).toBe('')
  })

  it('inserts direct calls after scheduled meetings', () => {
    const entries = {
      scheduledMeetings: ['Planning Backend'],
      directCalls: ['Call com Joao'],
    }
    const result = mergeCustomEntries(
      baseContent,
      '\u{1F4C6} (Planing Web)',
      entries,
    )

    const lines = result.split('\n')
    expect(lines[2]).toBe('\u{1F4C6} (Planning Backend)')
    expect(lines[3]).toBe('\u{260E}\u{FE0F} Call com Joao')
  })

  it('inserts after title when no meetingType exists', () => {
    const contentNoMeeting = [
      '**Standup (06/03/2026)**',
      '',
      '**\u{1F4CC} agrotrace-web**',
    ].join('\n')

    const entries = {
      scheduledMeetings: [],
      directCalls: ['Call com Joao'],
    }
    const result = mergeCustomEntries(contentNoMeeting, '', entries)

    const lines = result.split('\n')
    expect(lines[0]).toBe('**Standup (06/03/2026)**')
    expect(lines[1]).toBe('\u{260E}\u{FE0F} Call com Joao')
    expect(lines[2]).toBe('')
  })

  it('handles content with only direct calls (no scheduled meetings)', () => {
    const entries = {
      scheduledMeetings: [],
      directCalls: ['Sync com QA', 'Call com time mobile'],
    }
    const result = mergeCustomEntries(
      baseContent,
      '\u{1F4C6} (Planing Web)',
      entries,
    )

    const lines = result.split('\n')
    expect(lines[2]).toBe('\u{260E}\u{FE0F} Sync com QA')
    expect(lines[3]).toBe('\u{260E}\u{FE0F} Call com time mobile')
  })

  it('preserves the rest of the content unchanged', () => {
    const entries = {
      scheduledMeetings: ['Extra meeting'],
      directCalls: [],
    }
    const result = mergeCustomEntries(
      baseContent,
      '\u{1F4C6} (Planing Web)',
      entries,
    )

    // The repo section should still be there
    expect(result).toContain('**\u{1F4CC} agrotrace-web**')
    expect(result).toContain('\u{27A8} #1234 - Corrigir bug X')
  })
})
