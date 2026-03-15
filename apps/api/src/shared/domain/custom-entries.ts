import type { CustomEntries } from './types'

export function hasCustomEntries(
  entries: CustomEntries | null | undefined,
): boolean {
  if (!entries) {
    return false
  }

  return entries.scheduledMeetings.length > 0 || entries.directCalls.length > 0
}

export function formatScheduledMeetings(meetings: string[]): string[] {
  const lines: string[] = []

  for (const meeting of meetings) {
    const trimmed = meeting.trim()
    if (trimmed) {
      lines.push(`\u{1F4C6} (${trimmed})`)
    }
  }

  return lines
}

export function formatDirectCalls(calls: string[]): string[] {
  const lines: string[] = []

  for (const call of calls) {
    const trimmed = call.trim()
    if (trimmed) {
      lines.push(`\u{260E}\u{FE0F} ${trimmed}`)
    }
  }

  return lines
}

export function mergeCustomEntries(
  content: string,
  meetingType: string,
  entries: CustomEntries,
): string {
  if (!hasCustomEntries(entries)) {
    return content
  }

  const meetingLines = formatScheduledMeetings(entries.scheduledMeetings)
  const callLines = formatDirectCalls(entries.directCalls)

  if (meetingLines.length === 0 && callLines.length === 0) {
    return content
  }

  let result = content

  if (meetingLines.length > 0) {
    const lines = result.split('\n')
    let insertIndex = -1

    if (meetingType) {
      for (let i = 0; i < lines.length; i += 1) {
        if (lines[i]?.startsWith('\u{1F4C6}')) {
          insertIndex = i + 1
          break
        }
      }
    }

    if (insertIndex === -1) {
      for (let i = 0; i < lines.length; i += 1) {
        if (lines[i]?.startsWith('**Standup')) {
          insertIndex = i + 1
          break
        }
      }
    }

    if (insertIndex === -1) {
      insertIndex = 1
    }

    lines.splice(insertIndex, 0, ...meetingLines)
    result = lines.join('\n')
  }

  if (callLines.length > 0) {
    const trimmedEnd = result.trimEnd()
    result = `${trimmedEnd}\n${callLines.join('\n')}`
  }

  return result
}
