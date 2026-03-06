import { describe, expect, it } from 'vitest'
import {
  formatDirectCalls,
  formatScheduledMeetings,
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

describe('formatScheduledMeetings', () => {
  it('formats meetings with calendar emoji', () => {
    expect(formatScheduledMeetings(['Planning Backend'])).toEqual([
      '\u{1F4C6} (Planning Backend)',
    ])
  })

  it('formats multiple meetings', () => {
    expect(
      formatScheduledMeetings(['Planning Backend', 'Refinamento mobile']),
    ).toEqual([
      '\u{1F4C6} (Planning Backend)',
      '\u{1F4C6} (Refinamento mobile)',
    ])
  })

  it('skips empty/whitespace-only entries', () => {
    expect(formatScheduledMeetings(['Planning', '', '  '])).toEqual([
      '\u{1F4C6} (Planning)',
    ])
  })

  it('returns empty array when all entries are blank', () => {
    expect(formatScheduledMeetings(['', '  '])).toEqual([])
  })
})

describe('formatDirectCalls', () => {
  it('formats calls with phone emoji', () => {
    expect(formatDirectCalls(['Call com Joao sobre deploy'])).toEqual([
      '\u{260E}\u{FE0F} Call com Joao sobre deploy',
    ])
  })

  it('formats multiple calls', () => {
    expect(formatDirectCalls(['Call com Joao', 'Sync com QA'])).toEqual([
      '\u{260E}\u{FE0F} Call com Joao',
      '\u{260E}\u{FE0F} Sync com QA',
    ])
  })

  it('skips empty/whitespace-only entries', () => {
    expect(formatDirectCalls(['Call com Joao', '', '  '])).toEqual([
      '\u{260E}\u{FE0F} Call com Joao',
    ])
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
    '',
    '---',
  ].join('\n')

  it('returns original content when entries are empty', () => {
    const entries = { scheduledMeetings: [], directCalls: [] }
    expect(
      mergeCustomEntries(baseContent, '\u{1F4C6} (Planing Web)', entries),
    ).toBe(baseContent)
  })

  it('inserts scheduled meetings in header after meetingType line', () => {
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
    expect(lines[0]).toBe('**Standup (06/03/2026)**')
    expect(lines[1]).toBe('\u{1F4C6} (Planing Web)')
    expect(lines[2]).toBe('\u{1F4C6} (Planning Backend)')
    expect(lines[3]).toBe('') // empty line preserved
    expect(lines[4]).toBe('**\u{1F4CC} agrotrace-web**')
  })

  it('appends direct calls at the very end of content', () => {
    const entries = {
      scheduledMeetings: [],
      directCalls: ['Call com Joao'],
    }
    const result = mergeCustomEntries(
      baseContent,
      '\u{1F4C6} (Planing Web)',
      entries,
    )

    const lines = result.split('\n')
    // Header stays untouched
    expect(lines[0]).toBe('**Standup (06/03/2026)**')
    expect(lines[1]).toBe('\u{1F4C6} (Planing Web)')
    // Call appended after ---
    expect(lines[lines.length - 1]).toBe('\u{260E}\u{FE0F} Call com Joao')
  })

  it('places meetings in header AND calls at end when both provided', () => {
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

    // 📆 in header
    expect(lines[1]).toBe('\u{1F4C6} (Planing Web)')
    expect(lines[2]).toBe('\u{1F4C6} (Planning Backend)')

    // ☎️ at the very end
    expect(lines[lines.length - 1]).toBe('\u{260E}\u{FE0F} Call com Joao')

    // Body content still in the middle
    expect(result).toContain('**\u{1F4CC} agrotrace-web**')
    expect(result).toContain('\u{27A8} #1234 - Corrigir bug X')
  })

  it('appends multiple calls at the end', () => {
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
    expect(lines[lines.length - 2]).toBe('\u{260E}\u{FE0F} Sync com QA')
    expect(lines[lines.length - 1]).toBe(
      '\u{260E}\u{FE0F} Call com time mobile',
    )
  })

  it('inserts meetings after title when no meetingType exists', () => {
    const contentNoMeeting = [
      '**Standup (06/03/2026)**',
      '',
      '**\u{1F4CC} agrotrace-web**',
      '',
      '---',
    ].join('\n')

    const entries = {
      scheduledMeetings: ['Retro'],
      directCalls: [],
    }
    const result = mergeCustomEntries(contentNoMeeting, '', entries)

    const lines = result.split('\n')
    expect(lines[0]).toBe('**Standup (06/03/2026)**')
    expect(lines[1]).toBe('\u{1F4C6} (Retro)')
    expect(lines[2]).toBe('')
  })

  it('appends calls at end even when no meetingType', () => {
    const contentNoMeeting = [
      '**Standup (06/03/2026)**',
      '',
      '**\u{1F4CC} agrotrace-web**',
      '',
      '---',
    ].join('\n')

    const entries = {
      scheduledMeetings: [],
      directCalls: ['Call com Joao'],
    }
    const result = mergeCustomEntries(contentNoMeeting, '', entries)

    const lines = result.split('\n')
    // Header untouched
    expect(lines[0]).toBe('**Standup (06/03/2026)**')
    expect(lines[1]).toBe('')
    // Call at the end
    expect(lines[lines.length - 1]).toBe('\u{260E}\u{FE0F} Call com Joao')
  })

  it('preserves body content unchanged', () => {
    const entries = {
      scheduledMeetings: ['Extra meeting'],
      directCalls: ['Call X'],
    }
    const result = mergeCustomEntries(
      baseContent,
      '\u{1F4C6} (Planing Web)',
      entries,
    )

    expect(result).toContain('**\u{1F4CC} agrotrace-web**')
    expect(result).toContain('\u{27A8} #1234 - Corrigir bug X')
    expect(result).toContain('---')
  })
})
