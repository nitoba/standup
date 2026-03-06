import type { CustomEntries } from './types'

/**
 * Checks whether a CustomEntries object has any actual entries.
 */
export function hasCustomEntries(
  entries: CustomEntries | null | undefined,
): boolean {
  if (!entries) return false
  return entries.scheduledMeetings.length > 0 || entries.directCalls.length > 0
}

/**
 * Formats custom entries as lines to be inserted in the standup header.
 *
 * Scheduled meetings get the 📆 emoji prefix.
 * Direct calls get the ☎️ emoji prefix and are placed after scheduled meetings.
 *
 * @example
 * formatCustomEntries({
 *   scheduledMeetings: ['Planning Backend', 'Refinamento mobile'],
 *   directCalls: ['Call com Joao sobre deploy'],
 * })
 * // Returns:
 * // '📆 (Planning Backend)\n📆 (Refinamento mobile)\n☎️ Call com Joao sobre deploy'
 */
export function formatCustomEntries(entries: CustomEntries): string {
  const lines: string[] = []

  for (const meeting of entries.scheduledMeetings) {
    const trimmed = meeting.trim()
    if (trimmed) lines.push(`\u{1F4C6} (${trimmed})`)
  }

  for (const call of entries.directCalls) {
    const trimmed = call.trim()
    if (trimmed) lines.push(`\u{260E}\u{FE0F} ${trimmed}`)
  }

  return lines.join('\n')
}

/**
 * Merges custom entries into the standup content, placing them in the header
 * area right after the existing meetingType line (or after the standup title
 * if there is no meetingType).
 *
 * The format places 📆 entries first (below the existing 📆 meetingType),
 * then ☎️ entries at the end of the header block.
 *
 * @param content - The original LLM-generated standup content
 * @param meetingType - The existing meeting type (may be empty)
 * @param entries - The custom entries to merge
 * @returns The merged content string
 */
export function mergeCustomEntries(
  content: string,
  meetingType: string,
  entries: CustomEntries,
): string {
  if (!hasCustomEntries(entries)) return content

  const formatted = formatCustomEntries(entries)
  if (!formatted) return content

  const lines = content.split('\n')

  // Find the insertion point: after the meetingType line or after the title line
  let insertIndex = -1

  if (meetingType) {
    // Look for the existing meetingType line (📆 line in header)
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]?.startsWith('\u{1F4C6}')) {
        insertIndex = i + 1
        break
      }
    }
  }

  // If no meetingType line found, insert after the title (**Standup (...)**)
  if (insertIndex === -1) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]?.startsWith('**Standup')) {
        insertIndex = i + 1
        break
      }
    }
  }

  // Fallback: insert at line 1 (after first line)
  if (insertIndex === -1) {
    insertIndex = 1
  }

  const formattedLines = formatted.split('\n')
  lines.splice(insertIndex, 0, ...formattedLines)

  return lines.join('\n')
}
