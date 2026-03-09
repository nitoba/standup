import { type Routes } from '@angular/router'

import { authGuard } from './guards/auth.guard'

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./pages/login/login-page').then((m) => m.LoginPage),
  },
  {
    path: 'dashboard',
    // canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/dashboard/dashboard-page').then((m) => m.DashboardPage),
  },
  {
    path: 'standups/:id',
    // canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/standup-detail/standup-detail-page').then(
        (m) => m.StandupDetailPage,
      ),
  },
  {
    path: 'settings',
    // canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/settings/settings-page').then((m) => m.SettingsPage),
  },
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: '**', redirectTo: 'login' },
]
