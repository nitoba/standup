export function parseSelectedRepos(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)

    if (Array.isArray(parsed)) {
      return parsed.filter(
        (value): value is string => typeof value === 'string',
      )
    }

    return []
  } catch {
    return []
  }
}
