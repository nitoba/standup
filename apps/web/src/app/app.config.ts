import { provideHttpClient, withInterceptors } from '@angular/common/http'
import {
  type ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core'
import { provideRouter, withComponentInputBinding } from '@angular/router'
import { provideZard } from '@/shared/core/provider/providezard'

import { routes } from './app.routes'
import { authInterceptor } from './interceptors/auth.interceptor'
import { baseUrlInterceptor } from './interceptors/base-url.interceptor'
import { SessionService } from './services/session.service'

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([baseUrlInterceptor, authInterceptor])),
    provideZard(),
    provideRouter(routes, withComponentInputBinding()),
    provideAppInitializer(() => {
      const sessionService = inject(SessionService)
      sessionService.bootstrap()
    }),
  ],
}
