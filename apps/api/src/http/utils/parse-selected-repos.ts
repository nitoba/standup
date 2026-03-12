/**
 * Parses a JSON string of selected repository names into a typed string array.
 * Returns empty array if parsing fails or the value is not an array.
 */
export function parseSelectedRepos(rawSelectedRepos: string): string[] {
  try {
    const parsed = JSON.parse(rawSelectedRepos)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter((repo): repo is string => typeof repo === 'string')
  } catch {
    return []
  }
}
