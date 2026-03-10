import { Injectable, inject, NgZone, type OnDestroy } from '@angular/core'
import { Subject } from 'rxjs'
import { environment } from '../../../../environments/environment'

export type StandupGeneratedEvent = {
  type: 'standup_generated'
  standupId: string
  date: string
}

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

  /** Emits whenever a new standup is generated and ready for review. */
  readonly standupGenerated$ = new Subject<StandupGeneratedEvent>()

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

      this.eventSource.addEventListener('standup_generated', (e) => {
        try {
          const data = JSON.parse(
            (e as MessageEvent).data,
          ) as StandupGeneratedEvent
          this.ngZone.run(() => this.standupGenerated$.next(data))
        } catch {
          // Ignore malformed events
        }
      })

      this.eventSource.addEventListener('error', () => {
        // EventSource auto-reconnects on transient failures — no action needed
      })
    })
  }

  ngOnDestroy(): void {
    this.eventSource?.close()
    this.standupGenerated$.complete()
  }
}
