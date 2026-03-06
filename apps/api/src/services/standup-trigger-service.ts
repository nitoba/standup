import { ExternalServiceError, Result } from '@standup/domain'

export interface TriggerStandupJobDeps {
  workerInternalUrl: string
  internalSecret: string
}

export interface TriggerStandupJobOptions {
  extraContext?: string
  forceRegenerate?: boolean
  rewriteFromStandupId?: string
  rewriteInstruction?: string
}

/**
 * Solicita ao worker interno a execução do standup job.
 * A API apenas encaminha o trigger; a execução fica no worker.
 */
export async function triggerStandupJob(
  deps: TriggerStandupJobDeps,
  options?: TriggerStandupJobOptions,
): Promise<Result<void, ExternalServiceError>> {
  return Result.tryPromise({
    try: async () => {
      const hasBody =
        options?.extraContext !== undefined ||
        options?.forceRegenerate !== undefined

      const response = await fetch(
        `${deps.workerInternalUrl}/internal/trigger/standup`,
        {
          method: 'POST',
          headers: {
            'x-internal-secret': deps.internalSecret,
            ...(hasBody ? { 'content-type': 'application/json' } : {}),
          },
          ...(hasBody
            ? {
                body: JSON.stringify({
                  extraContext: options?.extraContext,
                  forceRegenerate: options?.forceRegenerate,
                  rewriteFromStandupId: options?.rewriteFromStandupId,
                  rewriteInstruction: options?.rewriteInstruction,
                }),
              }
            : {}),
        },
      )

      if (response.status !== 202) {
        throw new Error(`HTTP ${response.status}`)
      }
    },
    catch: (error) =>
      new ExternalServiceError({
        service: 'worker',
        message: `Failed to trigger standup job: ${error instanceof Error ? error.message : String(error)}`,
      }),
  })
}
