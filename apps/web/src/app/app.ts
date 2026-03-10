import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { RouterOutlet } from '@angular/router'
import { NgxSonnerToaster } from 'ngx-sonner'
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

  constructor() {
    this.darkMode.init()
  }
}
