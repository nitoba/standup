import { createServiceLogger } from '@standup/logger'

const logger = createServiceLogger({ service: 'api', component: 'event-bus' })

export type SseEvent =
  | {
      type: 'standup_progress'
      runId: string
      date: string
      mode: 'generate' | 'regenerate' | 'adjust'
      step:
        | 'queued'
        | 'collecting_git'
        | 'enriching_data'
        | 'generating_standup'
        | 'saving_draft'
        | 'notifying_review'
        | 'completed'
        | 'no_activity'
      message: string
      standupId?: string
    }
  | {
      type: 'standup_generated'
      runId: string
      standupId: string
      date: string
      mode: 'generate' | 'regenerate' | 'adjust'
    }
  | {
      type: 'standup_failed'
      runId: string
      date: string
      mode: 'generate' | 'regenerate' | 'adjust'
      message: string
    }
  | {
      type: 'standup_status_changed'
      standupId: string
      newStatus: string
    }
  | { type: 'ping' }

type Listener = (event: SseEvent) => void

/**
 * In-memory pub/sub bus scoped per userId.
 * Used to push SSE events to connected web clients.
 *
 * One EventBus instance is shared for the whole API process lifetime.
 */
export class EventBus {
  private readonly listeners = new Map<string, Set<Listener>>()

  /** Subscribe a listener for a given userId. Returns an unsubscribe function. */
  subscribe(userId: string, listener: Listener): () => void {
    let set = this.listeners.get(userId)
    if (!set) {
      set = new Set()
      this.listeners.set(userId, set)
    }
    set.add(listener)
    logger.debug('SSE listener subscribed', { userId })

    return () => {
      set?.delete(listener)
      if (set?.size === 0) {
        this.listeners.delete(userId)
      }
      logger.debug('SSE listener unsubscribed', { userId })
    }
  }

  /** Emit an event to all listeners for a given userId. */
  emit(userId: string, event: SseEvent): void {
    const set = this.listeners.get(userId)
    if (!set || set.size === 0) {
      logger.debug('No SSE listeners for user — skipping emit', {
        userId,
        eventType: event.type,
      })
      return
    }

    logger.info('Emitting SSE event', {
      userId,
      eventType: event.type,
      listenerCount: set.size,
    })

    for (const listener of set) {
      listener(event)
    }
  }

  /** Convenience: emit to all connected users (e.g. for broadcasts). */
  emitToAll(event: SseEvent): void {
    for (const [userId] of this.listeners) {
      this.emit(userId, event)
    }
  }
}
