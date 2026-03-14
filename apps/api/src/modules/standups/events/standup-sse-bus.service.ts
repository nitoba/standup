import { Injectable, type MessageEvent } from '@nestjs/common'
import type { Observable } from 'rxjs'
import { interval, merge, of, Observable as RxObservable } from 'rxjs'
import { map } from 'rxjs/operators'
import { AppLoggerFactory } from '../../../shared/logger'
import type { StandupSseEvent } from './standup-sse.types'

const KEEPALIVE_INTERVAL_MS = 30_000

type Listener = (event: MessageEvent) => void

@Injectable()
export class StandupSseBusService {
  private readonly logger: ReturnType<AppLoggerFactory['create']>
  private readonly listeners = new Map<string, Set<Listener>>()

  constructor(private readonly loggerFactory: AppLoggerFactory) {
    this.logger = this.loggerFactory.create('standup-sse-bus')
  }

  subscribe(userId: string): Observable<MessageEvent> {
    return new RxObservable<MessageEvent>((subscriber) => {
      this.logger.info('SSE connection opened', { userId })

      const connectionEvents = merge(
        of<MessageEvent>({
          type: 'connected',
          data: { ok: true },
        }),
        interval(KEEPALIVE_INTERVAL_MS).pipe(
          map(() => ({
            type: 'ping',
            data: { ts: Date.now() },
          })),
        ),
      ).subscribe((event) => subscriber.next(event))

      const listener: Listener = (event) => subscriber.next(event)
      const unsubscribe = this.addListener(userId, listener)

      return () => {
        connectionEvents.unsubscribe()
        unsubscribe()
        this.logger.info('SSE connection closed', { userId })
      }
    })
  }

  emit(userId: string, event: StandupSseEvent): void {
    const listeners = this.listeners.get(userId)

    if (!listeners || listeners.size === 0) {
      this.logger.debug('No SSE listeners for user', {
        userId,
        eventType: event.type,
      })
      return
    }

    this.logger.info('Emitting SSE event', {
      userId,
      eventType: event.type,
      listenerCount: listeners.size,
    })

    const message: MessageEvent = {
      type: event.type,
      data: event,
    }

    for (const listener of listeners) {
      listener(message)
    }
  }

  private addListener(userId: string, listener: Listener): () => void {
    let listeners = this.listeners.get(userId)

    if (!listeners) {
      listeners = new Set()
      this.listeners.set(userId, listeners)
    }

    listeners.add(listener)
    this.logger.debug('SSE listener subscribed', { userId })

    return () => {
      listeners.delete(listener)

      if (listeners.size === 0) {
        this.listeners.delete(userId)
      }

      this.logger.debug('SSE listener unsubscribed', { userId })
    }
  }
}
