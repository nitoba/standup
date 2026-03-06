import { randomUUID } from 'node:crypto'
import type { TriggerStandupOptions } from '../../services/trigger-standup-service.js'

const REQUEST_TTL_MS = 5 * 60 * 1000

export interface PendingTriggerRequest {
  id: string
  discordUserId: string
  options: TriggerStandupOptions
  expiresAt: number
}

const pendingRequests = new Map<string, PendingTriggerRequest>()

function clearExpiredRequests(now: number): void {
  for (const [id, request] of pendingRequests.entries()) {
    if (request.expiresAt <= now) {
      pendingRequests.delete(id)
    }
  }
}

export function createPendingTriggerRequest(
  discordUserId: string,
  options: TriggerStandupOptions,
): PendingTriggerRequest {
  const now = Date.now()
  clearExpiredRequests(now)

  const request: PendingTriggerRequest = {
    id: randomUUID(),
    discordUserId,
    options,
    expiresAt: now + REQUEST_TTL_MS,
  }

  pendingRequests.set(request.id, request)
  return request
}

export function consumePendingTriggerRequest(
  requestId: string,
): PendingTriggerRequest | undefined {
  const now = Date.now()
  clearExpiredRequests(now)

  const request = pendingRequests.get(requestId)
  if (!request) {
    return undefined
  }

  pendingRequests.delete(requestId)
  return request
}

export function clearPendingTriggerRequests(): void {
  pendingRequests.clear()
}
