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
 * Formats scheduled meetings as lines with the 📆 emoji prefix.
 * Each non-empty entry becomes `📆 (entry)`.
 */
export function formatScheduledMeetings(meetings: string[]): string[] {
  const lines: string[] = []
  for (const meeting of meetings) {
    const trimmed = meeting.trim()
    if (trimmed) lines.push(`\u{1F4C6} (${trimmed})`)
  }
  return lines
}

/**
 * Formats direct calls as lines with the ☎️ emoji prefix.
 * Each non-empty entry becomes `☎️ entry`.
 */
export function formatDirectCalls(calls: string[]): string[] {
  const lines: string[] = []
  for (const call of calls) {
    const trimmed = call.trim()
    if (trimmed) lines.push(`\u{260E}\u{FE0F} ${trimmed}`)
  }
  return lines
}

/**
 * Merges custom entries into the standup content.
 *
 * - 📆 scheduled meetings are placed in the **header**, right after the
 *   existing meetingType line (or after the title if no meetingType).
 * - ☎️ direct calls are appended at the **very end** of the content.
 *
 * @example
 * Input content:
 *   **Standup (06/03/2026)**
 *   📆 (Planing Web)
 *
 *   **📌 agrotrace-web**
 *   ...
 *   ---
 *
 * With entries { scheduledMeetings: ['Retro'], directCalls: ['Call com Joao'] }:
 *
 *   **Standup (06/03/2026)**
 *   📆 (Planing Web)
 *   📆 (Retro)
 *
 *   **📌 agrotrace-web**
 *   ...
 *   ---
 *   ☎️ Call com Joao
 */
export function mergeCustomEntries(
  content: string,
  meetingType: string,
  entries: CustomEntries,
): string {
  if (!hasCustomEntries(entries)) return content

  const meetingLines = formatScheduledMeetings(entries.scheduledMeetings)
  const callLines = formatDirectCalls(entries.directCalls)

  // If nothing to insert after filtering blanks, return as-is
  if (meetingLines.length === 0 && callLines.length === 0) return content

  let result = content

  // --- Insert 📆 meetings in the header ---
  if (meetingLines.length > 0) {
    const lines = result.split('\n')
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

    lines.splice(insertIndex, 0, ...meetingLines)
    result = lines.join('\n')
  }

  // --- Append ☎️ calls at the very end ---
  if (callLines.length > 0) {
    // Ensure there's a newline separator before the calls
    const trimmedEnd = result.trimEnd()
    result = `${trimmedEnd}\n${callLines.join('\n')}`
  }

  return result
}
