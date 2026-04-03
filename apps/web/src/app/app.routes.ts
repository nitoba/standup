import { type Routes } from '@angular/router'

import { authGuard } from './core/auth/auth-guard'
import { noAuthGuard } from './core/auth/no-auth-guard'

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [noAuthGuard],
    loadComponent: () =>
      import('./features/login/login-page').then((m) => m.LoginPage),
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/dashboard/dashboard-page').then(
        (m) => m.DashboardPage,
      ),
  },
  {
    path: 'standups/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/standup-detail/standup-detail-page').then(
        (m) => m.StandupDetailPage,
      ),
  },
  {
    path: 'weekly-digest',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/weekly-digest/weekly-digest-page').then(
        (m) => m.WeeklyDigestPage,
      ),
  },
  {
    path: 'settings',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/settings/settings-page').then((m) => m.SettingsPage),
  },
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: '**', redirectTo: 'dashboard' },
]
