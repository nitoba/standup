import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
} from '@angular/core'
import { RouterOutlet } from '@angular/router'
import { NgxSonnerToaster } from 'ngx-sonner'
import { SessionService } from './core/auth/session-service'
import { StandupEventsService } from './features/dashboard/services/standup-events-service'
import { ZardDarkMode } from './shared/services/dark-mode'

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NgxSonnerToaster],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly darkMode = inject(ZardDarkMode)
  private readonly session = inject(SessionService)
  private readonly standupEvents = inject(StandupEventsService)

  constructor() {
    this.darkMode.init()

    // Connect the SSE stream only while the user is authenticated (TAS-60, TAS-64).
    // Placed here (root component) so the lifecycle mirrors the app lifetime and
    // keeps StandupService free of auth knowledge.
    effect(() => {
      if (this.session.isAuthenticated()) {
        this.standupEvents.connect()
      } else {
        this.standupEvents.disconnect()
      }
    })
  }
}
