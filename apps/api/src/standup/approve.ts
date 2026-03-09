import type { CustomEntries, Result, StandupRecord } from '@standup/domain'
import {
  Result as BetterResult,
  CustomEntriesSchema,
  DbError,
  ExternalServiceError,
} from '@standup/domain'
import type { Context } from 'hono'
import * as z from 'zod'
import { approveStandup } from '../services/standup-approve-service.js'

export const approveBodySchema = z.object({
  customEntries: CustomEntriesSchema.nullable().optional(),
})

export type ApproveBody = z.infer<typeof approveBodySchema>

export interface ApproveHandlerDeps {
  databaseUrl: string
  publishApprovedStandup?: (
    record: StandupRecord,
  ) => Promise<Result<void, ExternalServiceError>>
}

async function publishNotConfigured(): Promise<
  Result<void, ExternalServiceError>
> {
  return BetterResult.err(
    new ExternalServiceError({
      service: 'discord',
      message: 'Publish not configured',
    }),
  )
}

export async function handleApproveStandup(
  c: Context,
  standupId: string,
  body: ApproveBody,
  deps: ApproveHandlerDeps,
  userId: string,
): Promise<Response> {
  const result = await approveStandup(
    standupId,
    userId,
    {
      databaseUrl: deps.databaseUrl,
      publishApprovedStandup:
        deps.publishApprovedStandup ?? publishNotConfigured,
    },
    (body.customEntries ?? undefined) as CustomEntries | null | undefined,
  )

  if (result.isErr()) {
    const error = result.error

    if (DbError.is(error)) {
      return c.json({ error: 'Internal server error' }, 500)
    }

    return c.json({ error: 'Internal server error' }, 500)
  }

  switch (result.value.kind) {
    case 'not_found':
      return c.json({ error: result.value.error.message }, 404)
    case 'invalid_transition':
      return c.json({ error: result.value.error.message }, 409)
    case 'publish_failed':
      return c.json(
        {
          data: result.value.standup,
          warning: result.value.error.message,
        },
        200,
      )
    case 'success':
      return c.json({ data: result.value.standup }, 200)
  }
}
