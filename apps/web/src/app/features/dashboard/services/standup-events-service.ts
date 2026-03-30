import { Injectable, inject, NgZone, type OnDestroy } from '@angular/core'
import { Subject } from 'rxjs'
import { environment } from '../../../../environments/environment'
import type { StandupEvent } from '../../../shared/models/standup-models'

/**
 * Connects to the API SSE stream at /standups/events and re-emits
 * incoming events as Observables that other services can subscribe to.
 *
 * Connection is lazy: call connect() only after the user is authenticated.
 * On a 401 the EventSource closes permanently — the error handler detects
 * this and schedules a reconnect attempt after a backoff delay so the
 * stream resumes once the session is restored (TAS-60, TAS-64).
 */
@Injectable({ providedIn: 'root' })
export class StandupEventsService implements OnDestroy {
  private readonly ngZone = inject(NgZone)

  private eventSource: EventSource | undefined
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined
  private reconnectDelayMs = 5_000
  private destroyed = false

  /** Emits lifecycle events for the user's active standup job. */
  readonly standupEvents$ = new Subject<StandupEvent>()

  /**
   * Open the SSE connection. Must only be called after the user is confirmed
   * to be authenticated — calling it unauthenticated causes an immediate 401
   * that permanently closes the EventSource (TAS-64).
   */
  connect(): void {
    if (this.eventSource) return // already connected
    this.openConnection()
  }

  /** Close the connection and cancel any pending reconnect. */
  disconnect(): void {
    this.cancelReconnect()
    this.eventSource?.close()
    this.eventSource = undefined
  }

  private openConnection(): void {
    // Run outside NgZone so EventSource callbacks don't trigger CD on every ping
    this.ngZone.runOutsideAngular(() => {
      this.eventSource = new EventSource(
        `${environment.apiBaseUrl}/standups/events`,
        { withCredentials: true },
      )

      const onStandupEvent = (e: Event) => {
        try {
          const data = JSON.parse((e as MessageEvent).data) as StandupEvent
          this.ngZone.run(() => this.standupEvents$.next(data))
        } catch {
          // Ignore malformed events — logged via console.warn for observability
          console.warn('[StandupEventsService] malformed SSE event', e)
        }
      }

      this.eventSource.addEventListener('standup_progress', onStandupEvent)
      this.eventSource.addEventListener('standup_generated', onStandupEvent)
      this.eventSource.addEventListener('standup_failed', onStandupEvent)
      this.eventSource.addEventListener(
        'standup_status_changed',
        onStandupEvent,
      )

      this.eventSource.addEventListener('error', () => {
        // readyState CLOSED means the connection was permanently terminated
        // (e.g. 401 Unauthorized). The browser will NOT auto-reconnect in this
        // case. We close, clear the ref and schedule a manual reconnect (TAS-60).
        if (this.eventSource?.readyState === EventSource.CLOSED) {
          this.eventSource.close()
          this.eventSource = undefined
          this.scheduleReconnect()
        }
        // readyState CONNECTING means the browser is already retrying a
        // transient failure — no action needed.
      })
    })
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return
    this.cancelReconnect()
    this.reconnectTimer = setTimeout(() => {
      if (!this.destroyed && !this.eventSource) {
        this.openConnection()
      }
    }, this.reconnectDelayMs)
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer !== undefined) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = undefined
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true
    this.disconnect()
    this.standupEvents$.complete()
  }
}
