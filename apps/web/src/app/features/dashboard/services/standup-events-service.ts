import { Injectable, inject, NgZone, type OnDestroy } from '@angular/core'
import { Subject } from 'rxjs'
import { environment } from '../../../../environments/environment'
import type { StandupEvent } from '../../../shared/models/standup-models'

/**
 * Connects to the API SSE stream at /standups/events and re-emits
 * incoming events as Observables that other services can subscribe to.
 *
 * The connection is established on first subscription and automatically
 * cleaned up when the service is destroyed (app shutdown).
 */
@Injectable({ providedIn: 'root' })
export class StandupEventsService implements OnDestroy {
  private readonly ngZone = inject(NgZone)

  private eventSource: EventSource | undefined

  /** Emits lifecycle events for the user's active standup job. */
  readonly standupEvents$ = new Subject<StandupEvent>()

  constructor() {
    this.connect()
  }

  private connect(): void {
    // Run outside NgZone so EventSource callbacks don't trigger CD on every ping
    this.ngZone.runOutsideAngular(() => {
      this.eventSource = new EventSource(
        `${environment.apiBaseUrl}/standups/events`,
        {
          withCredentials: true,
        },
      )

      const onStandupEvent = (e: Event) => {
        try {
          const data = JSON.parse((e as MessageEvent).data) as StandupEvent
          this.ngZone.run(() => this.standupEvents$.next(data))
        } catch {
          // Ignore malformed events
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
        // EventSource auto-reconnects on transient failures — no action needed
      })
    })
  }

  ngOnDestroy(): void {
    this.eventSource?.close()
    this.standupEvents$.complete()
  }
}
