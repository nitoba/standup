import { provideHttpClient, withInterceptors } from '@angular/common/http'
import {
  type ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core'
import { provideRouter, withComponentInputBinding } from '@angular/router'
import {
  provideTanStackQuery,
  QueryClient,
} from '@tanstack/angular-query-experimental'
import { provideZard } from '@/shared/core/provider/providezard'

import { routes } from './app.routes'
import { authInterceptor } from './core/auth/auth-interceptor'
import { baseUrlInterceptor } from './core/auth/base-url-interceptor'
import { SessionService } from './core/auth/session-service'

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([baseUrlInterceptor, authInterceptor])),
    provideZard(),
    provideTanStackQuery(new QueryClient()),
    provideRouter(routes, withComponentInputBinding()),
    provideAppInitializer(() => {
      const sessionService = inject(SessionService)
      sessionService.bootstrap()
    }),
  ],
}
