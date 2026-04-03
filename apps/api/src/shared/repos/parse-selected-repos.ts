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

export interface ParsedRepo {
  project: string
  name: string
}

export function parseRepoIdentifier(
  identifier: string,
  defaultProject: string,
): ParsedRepo {
  const slashCount = (identifier.match(/\//g) ?? []).length

  if (slashCount === 0) {
    return { project: defaultProject, name: identifier }
  }

  if (slashCount > 1) {
    return { project: defaultProject, name: identifier }
  }

  const slashIndex = identifier.indexOf('/')
  return {
    project: identifier.slice(0, slashIndex),
    name: identifier.slice(slashIndex + 1),
  }
}
