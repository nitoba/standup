import type { CustomEntries } from '@standup/domain'
import { CustomEntriesSchema, DbError } from '@standup/domain'
import type { Context } from 'hono'
import * as z from 'zod'
import { notifyStandupStatusChanged } from '../notifications/notify-standup-status-changed.js'
import { approveStandup } from '../services/standup-approve-service.js'

export const approveBodySchema = z.object({
  customEntries: CustomEntriesSchema.nullable().optional(),
})

export type ApproveBody = z.infer<typeof approveBodySchema>

export interface ApproveHandlerDeps {
  databaseUrl: string
  botInternalUrl: string
  internalSecret: string
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
    { databaseUrl: deps.databaseUrl },
    (body.customEntries ?? undefined) as CustomEntries | null | undefined,
  )

  if (result.isErr()) {
    if (DbError.is(result.error)) {
      return c.json({ error: 'Internal server error' }, 500)
    }

    return c.json({ error: 'Internal server error' }, 500)
  }

  switch (result.value.kind) {
    case 'not_found':
      return c.json({ error: result.value.error.message }, 404)
    case 'invalid_transition':
      return c.json({ error: result.value.error.message }, 409)
    case 'success': {
      const standup = result.value.standup
      // Notificar o bot para: editar a DM (remover botões) + publicar no canal
      void notifyStandupStatusChanged({
        botInternalUrl: deps.botInternalUrl,
        internalSecret: deps.internalSecret,
        standupId: standup.id,
        newStatus: 'approved',
      })
      return c.json({ data: standup }, 200)
    }
  }
}
