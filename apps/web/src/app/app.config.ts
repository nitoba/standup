import { provideHttpClient, withInterceptors } from '@angular/common/http'
import {
  APP_INITIALIZER,
  type ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core'
import { provideRouter, withComponentInputBinding } from '@angular/router'

import { routes } from './app.routes'
import { authInterceptor } from './interceptors/auth.interceptor'
import { baseUrlInterceptor } from './interceptors/base-url.interceptor'
import { SessionService } from './services/session.service'

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([baseUrlInterceptor, authInterceptor])),
    provideRouter(routes, withComponentInputBinding()),
    {
      provide: APP_INITIALIZER,
      multi: true,
      useFactory: (sessionService: SessionService) => () =>
        sessionService.bootstrap(),
      deps: [SessionService],
    },
  ],
}
