import { ExternalServiceError, Result } from '@standup/domain'

export interface TriggerStandupDeps {
  apiBaseUrl: string
}

export type TriggerStandupOutcome =
  | { accepted: true }
  | { accepted: false; reason: 'forbidden' }

/**
 * Dispara trigger manual no API, autenticando por discordUserId.
 */
export async function triggerStandup(
  discordUserId: string,
  deps: TriggerStandupDeps,
): Promise<Result<TriggerStandupOutcome, ExternalServiceError>> {
  return Result.tryPromise({
    try: async () => {
      const response = await fetch(`${deps.apiBaseUrl}/standups/trigger`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ discordUserId }),
      })

      if (response.status === 202) {
        return { accepted: true } as const
      }

      if (response.status === 403) {
        return { accepted: false, reason: 'forbidden' } as const
      }

      throw new Error(`HTTP ${response.status}`)
    },
    catch: (error) =>
      new ExternalServiceError({
        service: 'api',
        message: `Failed to trigger standup via API: ${error instanceof Error ? error.message : String(error)}`,
      }),
  })
}
