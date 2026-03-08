import { ExternalServiceError, Result } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'

export interface RepoInfo {
  name: string
  id: string
  project: string
}

const logger = createServiceLogger({
  service: 'discord-bot',
  component: 'fetch-available-repos',
})

export interface FetchAvailableReposDeps {
  workerInternalUrl: string
  internalSecret: string
}

// ---------------------------------------------------------------------------
// In-memory cache — repos rarely change; avoids slow MCP round-trip on every
// button click (Discord gives only 3s to respond with showModal).
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

let cachedRepos: RepoInfo[] = []
let cacheExpiresAt = 0

/**
 * Returns the cached repos if the cache is still valid.
 * Used by button handlers that need instant access (< 3s Discord timeout).
 */
export function getCachedRepos(): RepoInfo[] {
  if (Date.now() < cacheExpiresAt && cachedRepos.length > 0) {
    return cachedRepos
  }
  return []
}

/**
 * Fetches the list of available Azure DevOps repos from the worker.
 * The worker connects to Azure MCP and returns repos from configured projects.
 *
 * Results are cached for 5 minutes to avoid slow MCP round-trips on
 * subsequent calls (e.g., button interactions that must respond within 3s).
 */
export async function fetchAvailableRepos(
  deps: FetchAvailableReposDeps,
): Promise<Result<RepoInfo[], ExternalServiceError>> {
  // Return cache if fresh
  if (Date.now() < cacheExpiresAt && cachedRepos.length > 0) {
    return Result.ok(cachedRepos)
  }

  return Result.tryPromise({
    try: async () => {
      const response = await fetch(
        `${deps.workerInternalUrl}/internal/repos/list`,
        {
          method: 'GET',
          headers: {
            'x-internal-secret': deps.internalSecret,
          },
        },
      )

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = (await response.json()) as { repos?: unknown[] }
      const repos = data.repos ?? []

      const parsed = repos.filter(
        (r): r is RepoInfo =>
          typeof r === 'object' &&
          r !== null &&
          typeof (r as Record<string, unknown>).name === 'string' &&
          typeof (r as Record<string, unknown>).id === 'string' &&
          typeof (r as Record<string, unknown>).project === 'string',
      )

      // Update cache
      cachedRepos = parsed
      cacheExpiresAt = Date.now() + CACHE_TTL_MS

      logger.info('Repos cache refreshed', { count: parsed.length })

      return parsed
    },
    catch: (error) => {
      const message = error instanceof Error ? error.message : String(error)
      logger.warn('Failed to fetch available repos from worker', {
        error: message,
      })
      return new ExternalServiceError({
        service: 'worker',
        message: `Failed to fetch available repos: ${message}`,
      })
    },
  })
}
