import { ExternalServiceError, Result } from '@standup/domain'

export interface TriggerStandupDeps {
  apiBaseUrl: string
  internalSecret: string
}

export interface TriggerStandupOptions {
  extraContext?: string
  forceRegenerate?: boolean
  rewriteFromStandupId?: string
  rewriteInstruction?: string
  replaceStandupId?: string
  reuseExistingSource?: boolean
}

export type TriggerStandupOutcome =
  | { accepted: true }
  | { accepted: false; reason: 'forbidden' }
  | {
      accepted: false
      reason: 'pending_review_exists' | 'already_approved_today'
      standupId?: string
    }

/**
 * Dispara trigger manual no API via internal auth (x-internal-secret).
 * Envia userId e discordUserId no body para que o API propague ao worker.
 */
export async function triggerStandup(
  userId: string,
  discordUserId: string,
  deps: TriggerStandupDeps,
  options?: TriggerStandupOptions,
): Promise<Result<TriggerStandupOutcome, ExternalServiceError>> {
  return Result.tryPromise({
    try: async () => {
      const response = await fetch(`${deps.apiBaseUrl}/standups/trigger`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-secret': deps.internalSecret,
        },
        body: JSON.stringify({
          userId,
          discordUserId,
          extraContext: options?.extraContext,
          forceRegenerate: options?.forceRegenerate,
          rewriteFromStandupId: options?.rewriteFromStandupId,
          rewriteInstruction: options?.rewriteInstruction,
          replaceStandupId: options?.replaceStandupId,
          reuseExistingSource: options?.reuseExistingSource,
        }),
      })

      if (response.status === 202) {
        return { accepted: true } as const
      }

      if (response.status === 403) {
        return { accepted: false, reason: 'forbidden' } as const
      }

      if (response.status === 409) {
        const payload = (await response.json()) as {
          reason?: 'pending_review_exists' | 'already_approved_today'
          standupId?: string
        }

        if (
          payload.reason === 'pending_review_exists' ||
          payload.reason === 'already_approved_today'
        ) {
          return {
            accepted: false,
            reason: payload.reason,
            standupId: payload.standupId,
          } as const
        }
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
