# Angular Skill Conformance Implementation Plan

**Goal:** Bring `apps/web/` into Angular v21 skill conformance by wiring mock-backed HTTP resources, extracting dashboard leaf components, fixing signal/routing usage, cleaning sidebar class bindings, and adding the first auth/accessibility skeletons.

**Architecture:** The design requires a real Angular HTTP shape even before the backend exists. I am implementing that as a mock-first interceptor stack (`authInterceptor` + `mockApiInterceptor`) plus `httpResource()`-based services, because that preserves production-facing component APIs while keeping the current hacker UI untouched. Component extraction stays shallow: the dashboard page becomes an orchestrator, leaf components own rendering/emits, and routing/auth remain functional via `CanActivateFn` and `withComponentInputBinding()`.

**Design:** `thoughts/shared/designs/2026-03-09-angular-skill-conformance-design.md`

**Project patterns checked:** `apps/web/AGENTS.md`; `.mindmodel/` is not present in this repo, so Angular/Tailwind conventions come from the app-local agent instructions and existing `apps/web/src/app/**/*.spec.ts` patterns.

---

## Dependency Graph

```text
Batch 1 (parallel): 1.1, 1.2, 1.3 [foundation - no deps]
Batch 2 (parallel): 2.1, 2.2, 2.3 [HTTP + routing - depends on batch 1]
Batch 3 (parallel): 3.1, 3.2, 3.3, 3.4 [service + leaf components - depends on batch 2 where applicable]
Batch 4 (parallel): 4.1, 4.2, 4.3, 4.4 [page composition + polish - depends on batch 3 where applicable]
```

---

## Batch 1: Foundation (parallel - 3 implementers)

All tasks in this batch have no dependencies and establish reusable primitives.

### Task 1.1: Extract reusable mock standup builders
**File:** `apps/web/src/app/data/mock-data.ts`
**Test:** `apps/web/src/app/data/mock-data.spec.ts`
**Depends:** none

Design requires moving the hardcoded service data out of `StandupService`. I am implementing one dedicated mock-data module that owns fixture generation, filtering, and immutable status updates so both the interceptor and tests consume the same source of truth.

```typescript
import type {
  Standup,
  StandupSection,
  StandupSourceRepo,
  StandupStatus,
} from '../types/standup'

export const METRIC_CHANGES = {
  total: '++ 12 this_week',
  approved: '++ 8 this_week',
  pending: '++ 3 today',
  rejected: '++ 1 today',
} as const

const TARGET_TOTAL = 142
const TARGET_APPROVED = 128
const TARGET_PENDING = 8
const TARGET_REJECTED = 6

export type StandupFilters = {
  status?: string | null
  date?: string | null
  search?: string | null
}

export function buildMockStandups(): Standup[] {
  const featured = buildFeaturedStandups()
  const remaining = TARGET_TOTAL - featured.length
  const featuredCounts = featured.reduce(
    (acc, standup) => {
      if (standup.status === 'approved') acc.approved += 1
      if (standup.status === 'pending_review') acc.pending += 1
      if (standup.status === 'rejected') acc.rejected += 1
      return acc
    },
    { approved: 0, pending: 0, rejected: 0 },
  )
  const statusPool = buildStatusPool(remaining, featuredCounts)

  const filler = Array.from({ length: remaining }, (_, index) => {
    const status = statusPool[index] ?? 'approved'
    const day = String(6 - (index % 5)).padStart(2, '0')

    return {
      id: `auto-${index + 1}`,
      date: `2026-03-${day}`,
      status,
      createdAt: '17:20',
      contentPreview:
        'updated automation flows and reviewed standup generation outputs...',
      sections: buildDefaultSections(),
      sources: buildDefaultSources(),
    }
  })

  return [...featured, ...filler]
}

export function filterStandups(
  standups: readonly Standup[],
  filters: StandupFilters,
): Standup[] {
  return standups.filter((standup) => {
    const matchesStatus =
      !filters.status || filters.status === 'all'
        ? true
        : standup.status === filters.status
    const matchesDate =
      !filters.date || filters.date === 'all'
        ? true
        : filters.date === 'this_week'
          ? standup.date >= '2026-03-03'
          : standup.date === filters.date
    const normalizedSearch = filters.search?.trim().toLowerCase()
    const matchesSearch = !normalizedSearch
      ? true
      : [standup.contentPreview, standup.id, standup.date]
          .join(' ')
          .toLowerCase()
          .includes(normalizedSearch)

    return matchesStatus && matchesDate && matchesSearch
  })
}

export function updateStandupStatus(
  standups: readonly Standup[],
  id: string,
  status: StandupStatus,
): Standup | undefined {
  const target = standups.find((standup) => standup.id === id)
  if (!target) return undefined

  return {
    ...target,
    status,
  }
}

function buildStatusPool(
  remaining: number,
  featuredCounts: { approved: number; pending: number; rejected: number },
): StandupStatus[] {
  const approvedNeeded = Math.max(TARGET_APPROVED - featuredCounts.approved, 0)
  const pendingNeeded = Math.max(TARGET_PENDING - featuredCounts.pending, 0)
  const rejectedNeeded = Math.max(TARGET_REJECTED - featuredCounts.rejected, 0)

  const pool: StandupStatus[] = [
    ...Array.from({ length: approvedNeeded }, () => 'approved' as const),
    ...Array.from({ length: pendingNeeded }, () => 'pending_review' as const),
    ...Array.from({ length: rejectedNeeded }, () => 'rejected' as const),
  ]

  return pool.slice(0, remaining)
}

function buildFeaturedStandups(): Standup[] {
  return [
    {
      id: '7f3a2b1c',
      date: '2026-03-09',
      status: 'pending_review',
      createdAt: '17:32',
      contentPreview:
        'implemented retry logic with exponential backoff for standup generation pipeline...',
      sections: buildDetailSections(),
      sources: buildDetailSources(),
    },
    {
      id: 'standup-2026-03-08',
      date: '2026-03-08',
      status: 'pending_review',
      createdAt: '17:31',
      contentPreview:
        'added discord slash commands for standup trigger, list, and approve...',
      sections: buildDefaultSections(),
      sources: buildDefaultSources(),
    },
    {
      id: 'standup-2026-03-07',
      date: '2026-03-07',
      status: 'approved',
      createdAt: '17:30',
      contentPreview:
        'refactored http route handlers into separate modular files for better maintainability...',
      sections: buildDefaultSections(),
      sources: buildDefaultSources(),
    },
    {
      id: 'standup-2026-03-06',
      date: '2026-03-06',
      status: 'rejected',
      createdAt: '17:29',
      contentPreview:
        'added manual trigger endpoint with internal auth validation...',
      sections: buildDefaultSections(),
      sources: buildDefaultSources(),
    },
    {
      id: 'standup-2026-03-05',
      date: '2026-03-05',
      status: 'approved',
      createdAt: '17:28',
      contentPreview:
        'adjusted scheduler recovery logic to prevent duplicate runs...',
      sections: buildDefaultSections(),
      sources: buildDefaultSources(),
    },
  ]
}

function buildDetailSections(): StandupSection[] {
  return [
    {
      title: '## o que foi feito',
      tone: 'default',
      items: [
        '- implementacao do endpoint de trigger manual para standups via api rest, incluindo validacao de autenticacao por session e internal secret',
        '- refatoracao dos handlers http do discord-bot, separando responsabilidades em arquivos individuais conforme convencao do projeto',
        '- correcao de bug no lock distribuido do job runner que permitia execucao duplicada quando recovery cron rodava simultaneamente',
      ],
    },
    {
      title: '## em andamento',
      tone: 'cyan',
      items: [
        '- testes de integracao para o fluxo completo de geracao e publicacao de standups [PBI-4521]',
      ],
    },
    {
      title: '## bloqueios',
      tone: 'muted',
      items: ['- nenhum bloqueio no momento'],
    },
  ]
}

function buildDefaultSections(): StandupSection[] {
  return [
    {
      title: '## o que foi feito',
      tone: 'default',
      items: ['- ajustes de pipeline e melhorias de observabilidade'],
    },
  ]
}

function buildDetailSources(): StandupSourceRepo[] {
  return [
    {
      name: 'agrotrace-api/',
      commits: [
        {
          hash: 'a3f21bc',
          message: 'feat: add manual trigger endpoint with session auth',
        },
        {
          hash: 'e7d4f98',
          message: 'fix: prevent duplicate job execution on concurrent lock',
        },
      ],
    },
    {
      name: 'agrotrace-web/',
      commits: [
        {
          hash: '1b9c3e7',
          message: 'refactor: extract http handlers into separate modules',
        },
      ],
    },
  ]
}

function buildDefaultSources(): StandupSourceRepo[] {
  return [
    {
      name: 'standup-service/',
      commits: [
        {
          hash: 'e10a3d2',
          message: 'chore: update standup generator pipeline',
        },
      ],
    },
  ]
}
```

```typescript
import { describe, expect, it } from 'vitest'

import {
  buildMockStandups,
  filterStandups,
  updateStandupStatus,
} from './mock-data'

describe('mock-data', () => {
  it('builds the expected total number of standups', () => {
    expect(buildMockStandups()).toHaveLength(142)
  })

  it('filters standups by status, date, and search', () => {
    const standups = buildMockStandups()
    const filtered = filterStandups(standups, {
      status: 'pending_review',
      date: '2026-03-09',
      search: 'retry logic',
    })

    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.id).toBe('7f3a2b1c')
  })

  it('returns an updated standup snapshot without mutating the source array', () => {
    const standups = buildMockStandups()
    const updated = updateStandupStatus(standups, '7f3a2b1c', 'approved')

    expect(updated?.status).toBe('approved')
    expect(standups.find((item) => item.id === '7f3a2b1c')?.status).toBe(
      'pending_review',
    )
  })
})
```

**Verify:** `bun run --cwd apps/web test -- --include src/app/data/mock-data.spec.ts`
**Commit:** `feat(web): extract reusable mock standup data helpers`

### Task 1.2: Add passthrough auth interceptor skeleton
**File:** `apps/web/src/app/interceptors/auth.interceptor.ts`
**Test:** `apps/web/src/app/interceptors/auth.interceptor.spec.ts`
**Depends:** none

Design requires establishing the interceptor chain now, even before real auth exists. I am implementing the minimal Angular-conformant `HttpInterceptorFn` that transparently forwards requests so the chain shape is stable when auth headers arrive later.

```typescript
import {
  type HttpHandlerFn,
  type HttpInterceptorFn,
  type HttpRequest,
} from '@angular/common/http'

export const authInterceptor: HttpInterceptorFn = (
  request: HttpRequest<unknown>,
  next: HttpHandlerFn,
) => next(request)
```

```typescript
import { HttpRequest, HttpResponse } from '@angular/common/http'
import { describe, expect, it, vi } from 'vitest'

import { authInterceptor } from './auth.interceptor'

describe('authInterceptor', () => {
  it('passes the original request to the next handler', async () => {
    const request = new HttpRequest('GET', '/api/standups')
    const next = vi.fn().mockReturnValue(Promise.resolve(new HttpResponse()))

    await authInterceptor(request, next as never)

    expect(next).toHaveBeenCalledWith(request)
  })
})
```

**Verify:** `bun run --cwd apps/web test -- --include src/app/interceptors/auth.interceptor.spec.ts`
**Commit:** `feat(web): add auth interceptor skeleton`

### Task 1.3: Add functional auth guard skeleton
**File:** `apps/web/src/app/guards/auth.guard.ts`
**Test:** `apps/web/src/app/guards/auth.guard.spec.ts`
**Depends:** none

Design requires route-protection scaffolding without introducing a full auth service yet. I am implementing a pure `CanActivateFn` that returns `true` today and documents the future inject-based extension point.

```typescript
import { inject } from '@angular/core'
import { type CanActivateFn } from '@angular/router'

class FutureAuthService {
  readonly isAuthenticated = () => true
}

export const authGuard: CanActivateFn = () => {
  const authService = inject(FutureAuthService)
  return authService.isAuthenticated()
}

export { FutureAuthService }
```

```typescript
import { TestBed } from '@angular/core/testing'
import { describe, expect, it } from 'vitest'

import { authGuard, FutureAuthService } from './auth.guard'

describe('authGuard', () => {
  it('allows activation while auth is still a skeleton', () => {
    TestBed.configureTestingModule({
      providers: [FutureAuthService],
    })

    const allowed = TestBed.runInInjectionContext(() =>
      authGuard({} as never, {} as never),
    )

    expect(allowed).toBe(true)
  })
})
```

**Verify:** `bun run --cwd apps/web test -- --include src/app/guards/auth.guard.spec.ts`
**Commit:** `feat(web): add auth guard skeleton`

---

## Batch 2: HTTP + Routing (parallel - 3 implementers)

These tasks wire the foundation into Angular providers and route definitions.

### Task 2.1: Implement mock API interceptor
**File:** `apps/web/src/app/interceptors/mock-api.interceptor.ts`
**Test:** `apps/web/src/app/interceptors/mock-api.interceptor.spec.ts`
**Depends:** 1.1

Design requires the app to speak HTTP now, not later. I am implementing an in-memory interceptor with realistic delay, query filtering, 404 handling, and mutable status updates so `httpResource()` exercises the same flow the real backend will use.

```typescript
import {
  HttpErrorResponse,
  HttpResponse,
  type HttpEvent,
  type HttpHandlerFn,
  type HttpInterceptorFn,
  type HttpRequest,
} from '@angular/common/http'
import { Observable, delay, of, throwError } from 'rxjs'

import {
  buildMockStandups,
  filterStandups,
  updateStandupStatus,
} from '../data/mock-data'
import type { StandupStatus } from '../types/standup'

let standups = buildMockStandups()

export const mockApiInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith('/api/')) {
    return next(request)
  }

  if (request.method === 'GET' && request.url.startsWith('/api/standups/')) {
    return respondToDetail(request)
  }

  if (request.method === 'GET' && request.url === '/api/standups') {
    return respondToList(request)
  }

  if (
    request.method === 'PATCH' &&
    request.url.startsWith('/api/standups/') &&
    request.url.endsWith('/status')
  ) {
    return respondToStatusUpdate(request)
  }

  if (request.method === 'POST' && request.url === '/api/standups/trigger') {
    return withDelay({ triggered: true }, 202)
  }

  return throwError(
    () =>
      new HttpErrorResponse({
        status: 404,
        statusText: 'Not Found',
        url: request.url,
        error: { message: 'mock endpoint not found' },
      }),
  )
}

function respondToList(
  request: HttpRequest<unknown>,
): Observable<HttpEvent<unknown>> {
  const status = request.params.get('status')
  const date = request.params.get('date')
  const search = request.params.get('search')

  return withDelay(filterStandups(standups, { status, date, search }))
}

function respondToDetail(
  request: HttpRequest<unknown>,
): Observable<HttpEvent<unknown>> {
  const id = request.url.split('/').pop() ?? ''
  const standup = standups.find((item) => item.id === id)

  if (!standup) {
    return throwError(
      () =>
        new HttpErrorResponse({
          status: 404,
          statusText: 'Not Found',
          url: request.url,
          error: { message: `standup ${id} not found` },
        }),
    )
  }

  return withDelay(standup)
}

function respondToStatusUpdate(
  request: HttpRequest<unknown>,
): Observable<HttpEvent<unknown>> {
  const id = request.url.split('/')[3] ?? ''
  const body = request.body as { status?: StandupStatus }

  if (!body.status) {
    return throwError(
      () =>
        new HttpErrorResponse({
          status: 400,
          statusText: 'Bad Request',
          url: request.url,
          error: { message: 'status is required' },
        }),
    )
  }

  const updated = updateStandupStatus(standups, id, body.status)
  if (!updated) {
    return throwError(
      () =>
        new HttpErrorResponse({
          status: 404,
          statusText: 'Not Found',
          url: request.url,
          error: { message: `standup ${id} not found` },
        }),
    )
  }

  standups = standups.map((item) => (item.id === id ? updated : item))
  return withDelay(updated)
}

function withDelay(body: unknown, status = 200) {
  return of(
    new HttpResponse({
      status,
      body,
    }),
  ).pipe(delay(getMockDelay()))
}

function getMockDelay() {
  return 300 + Math.floor(Math.random() * 301)
}

export function resetMockApiState() {
  standups = buildMockStandups()
}
```

```typescript
import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http'
import { TestBed, fakeAsync, tick } from '@angular/core/testing'
import { firstValueFrom } from 'rxjs'
import { afterEach, describe, expect, it } from 'vitest'

import { mockApiInterceptor, resetMockApiState } from './mock-api.interceptor'

describe('mockApiInterceptor', () => {
  afterEach(() => resetMockApiState())

  function setup() {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([mockApiInterceptor]))],
    })

    return TestBed.inject(HttpClient)
  }

  it('returns standup lists with filters applied', fakeAsync(() => {
    const http = setup()
    let body: unknown

    firstValueFrom(
      http.get('/api/standups', {
        params: { status: 'pending_review', date: '2026-03-09' },
      }),
    ).then((value) => {
      body = value
    })

    tick(700)

    expect(Array.isArray(body)).toBe(true)
    expect((body as Array<{ id: string }>)[0]?.id).toBe('7f3a2b1c')
  }))

  it('returns standup detail by id', fakeAsync(() => {
    const http = setup()
    let body: unknown

    firstValueFrom(http.get('/api/standups/7f3a2b1c')).then((value) => {
      body = value
    })

    tick(700)

    expect((body as { id: string }).id).toBe('7f3a2b1c')
  }))

  it('updates standup status through patch requests', fakeAsync(() => {
    const http = setup()
    let body: unknown

    firstValueFrom(
      http.patch('/api/standups/7f3a2b1c/status', { status: 'approved' }),
    ).then((value) => {
      body = value
    })

    tick(700)

    expect((body as { status: string }).status).toBe('approved')
  }))

  it('returns trigger acknowledgement', fakeAsync(() => {
    const http = setup()
    let body: unknown

    firstValueFrom(http.post('/api/standups/trigger', {})).then((value) => {
      body = value
    })

    tick(700)

    expect((body as { triggered: boolean }).triggered).toBe(true)
  }))
})
```

**Verify:** `bun run --cwd apps/web test -- --include src/app/interceptors/mock-api.interceptor.spec.ts`
**Commit:** `feat(web): add mock api interceptor for standup endpoints`

### Task 2.2: Register functional interceptor chain in app config
**File:** `apps/web/src/app/app.config.ts`
**Test:** none
**Depends:** 1.2, 2.1

This is a pure provider task. I am keeping it standalone because Angular application config does not need its own spec as long as the service and page specs exercise the configured provider pattern.

```typescript
import { provideHttpClient, withInterceptors } from '@angular/common/http'
import {
  type ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core'
import { provideRouter, withComponentInputBinding } from '@angular/router'

import { routes } from './app.routes'
import { authInterceptor } from './interceptors/auth.interceptor'
import { mockApiInterceptor } from './interceptors/mock-api.interceptor'

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(
      withInterceptors([authInterceptor, mockApiInterceptor]),
    ),
    provideRouter(routes, withComponentInputBinding()),
  ],
}
```

**Verify:** `bun run --cwd apps/web test -- --include src/app/services/standup.service.spec.ts`
**Commit:** `feat(web): register app interceptor chain`

### Task 2.3: Apply auth guard to protected routes
**File:** `apps/web/src/app/app.routes.ts`
**Test:** `apps/web/src/app/app.routes.spec.ts`
**Depends:** 1.3

Design requires the routing contract now, even though auth is passthrough. I am applying `authGuard` only to private views and leaving `login` public so the eventual auth service can slot in without route churn.

```typescript
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
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/dashboard/dashboard-page').then((m) => m.DashboardPage),
  },
  {
    path: 'standups/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/standup-detail/standup-detail-page').then(
        (m) => m.StandupDetailPage,
      ),
  },
  {
    path: 'settings',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/settings/settings-page').then((m) => m.SettingsPage),
  },
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: '**', redirectTo: 'login' },
]
```

```typescript
import { describe, expect, it } from 'vitest'

import { authGuard } from './guards/auth.guard'
import { routes } from './app.routes'

describe('routes', () => {
  it('defines login and dashboard routes', () => {
    const paths = routes.map((route) => route.path)
    expect(paths).toContain('login')
    expect(paths).toContain('dashboard')
  })

  it('protects private routes with authGuard', () => {
    const protectedPaths = ['dashboard', 'standups/:id', 'settings']

    for (const path of protectedPaths) {
      const route = routes.find((candidate) => candidate.path === path)
      expect(route?.canActivate).toContain(authGuard)
    }
  })
})
```

**Verify:** `bun run --cwd apps/web test -- --include src/app/app.routes.spec.ts`
**Commit:** `feat(web): protect private routes with auth guard`

---

## Batch 3: Service + Leaf Components (parallel - 4 implementers)

This batch delivers the reactive data layer and dashboard building blocks.

### Task 3.1: Refactor StandupService to httpResource
**File:** `apps/web/src/app/services/standup.service.ts`
**Test:** `apps/web/src/app/services/standup.service.spec.ts`
**Depends:** 2.1, 2.2

Design requires a real HTTP-backed service. I am implementing `httpResource()` for list/detail loading and `HttpClient.patch()` plus explicit `reload()` calls for mutations because that matches Angular's signal-first data access model and keeps the UI reactive without introducing local cache duplication.

```typescript
import { HttpClient, httpResource } from '@angular/common/http'
import { computed, Injectable, inject } from '@angular/core'
import { firstValueFrom } from 'rxjs'

import { METRIC_CHANGES } from '../data/mock-data'
import type { DashboardMetrics, Standup, StandupStatus } from '../types/standup'

@Injectable({ providedIn: 'root' })
export class StandupService {
  private readonly http = inject(HttpClient)

  readonly standups = httpResource<Standup[]>(() => '/api/standups', {
    defaultValue: [],
  })

  readonly metrics = computed<DashboardMetrics>(() => {
    const counts = this.standups.value().reduce(
      (acc, standup) => {
        acc.total += 1
        if (standup.status === 'approved') acc.approved += 1
        if (standup.status === 'pending_review') acc.pending += 1
        if (standup.status === 'rejected') acc.rejected += 1
        return acc
      },
      { total: 0, approved: 0, pending: 0, rejected: 0 },
    )

    return {
      total: { count: counts.total, change: METRIC_CHANGES.total },
      approved: { count: counts.approved, change: METRIC_CHANGES.approved },
      pending: { count: counts.pending, change: METRIC_CHANGES.pending },
      rejected: { count: counts.rejected, change: METRIC_CHANGES.rejected },
    }
  })

  getStandupById(id: () => string | undefined) {
    return httpResource<Standup>(() => {
      const value = id()
      return value ? `/api/standups/${value}` : undefined
    })
  }

  approve(id: string) {
    return this.updateStatus(id, 'approved')
  }

  reject(id: string) {
    return this.updateStatus(id, 'rejected')
  }

  regenerate(id: string) {
    return this.updateStatus(id, 'pending_review')
  }

  private async updateStatus(id: string, status: StandupStatus) {
    await firstValueFrom(
      this.http.patch(`/api/standups/${id}/status`, {
        status,
      }),
    )
    this.standups.reload()
  }
}
```

```typescript
import {
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http'
import { TestBed, fakeAsync, tick } from '@angular/core/testing'

import { mockApiInterceptor, resetMockApiState } from '../interceptors/mock-api.interceptor'
import { StandupService } from './standup.service'

describe('StandupService', () => {
  beforeEach(() => {
    resetMockApiState()
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([mockApiInterceptor]))],
    })
  })

  it('computes dashboard metrics from standups', fakeAsync(() => {
    const service = TestBed.inject(StandupService)

    tick(700)

    const metrics = service.metrics()
    expect(metrics.total.count).toBe(142)
    expect(metrics.approved.count).toBe(128)
    expect(metrics.pending.count).toBe(8)
    expect(metrics.rejected.count).toBe(6)
  }))

  it('loads standup detail through httpResource', fakeAsync(() => {
    const service = TestBed.inject(StandupService)
    const detail = service.getStandupById(() => '7f3a2b1c')

    tick(700)

    expect(detail.value()?.id).toBe('7f3a2b1c')
  }))

  it('updates standup status and reloads the list', fakeAsync(async () => {
    const service = TestBed.inject(StandupService)

    tick(700)
    await service.approve('7f3a2b1c')
    tick(700)

    const updated = service.standups.value().find((item) => item.id === '7f3a2b1c')
    expect(updated?.status).toBe('approved')
  }))
})
```

**Verify:** `bun run --cwd apps/web test -- --include src/app/services/standup.service.spec.ts`
**Commit:** `feat(web): refactor standup service to http resources`

### Task 3.2: Create MetricCard leaf component
**File:** `apps/web/src/app/pages/dashboard/metric-card.ts`
**Test:** `apps/web/src/app/pages/dashboard/metric-card.spec.ts`
**Depends:** none

I am making `MetricCard` a pure presentational component with required signal inputs and a host class because the design wants small focused pieces with no dashboard logic leakage.

```typescript
import { ChangeDetectionStrategy, Component, input } from '@angular/core'

@Component({
  selector: 'app-metric-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'metric-card border border-[var(--border)] p-[24px] flex flex-col gap-[12px]',
  },
  template: `
    <div class="flex items-center gap-[8px]">
      <span class="h-[6px] w-[6px] rounded-full" [class]="dotColor()"></span>
      <span class="text-[var(--text-secondary)] font-[var(--font-jetbrains)] text-[12px]">{{ label() }}</span>
    </div>
    <div class="font-[var(--font-jetbrains)] text-[28px] font-bold" [class]="valueColor()">
      {{ value() }}
    </div>
    <div class="font-[var(--font-ibm)] text-[12px]" [class]="changeColor()">
      {{ change() }}
    </div>
  `,
})
export class MetricCard {
  readonly label = input.required<string>()
  readonly value = input.required<number>()
  readonly change = input.required<string>()
  readonly dotColor = input.required<string>()
  readonly valueColor = input.required<string>()
  readonly changeColor = input.required<string>()
}
```

```typescript
import { TestBed } from '@angular/core/testing'

import { MetricCard } from './metric-card'

describe('MetricCard', () => {
  it('renders label, value, and change text', async () => {
    await TestBed.configureTestingModule({
      imports: [MetricCard],
    }).compileComponents()

    const fixture = TestBed.createComponent(MetricCard)
    fixture.componentRef.setInput('label', 'approved')
    fixture.componentRef.setInput('value', 128)
    fixture.componentRef.setInput('change', '++ 8 this_week')
    fixture.componentRef.setInput('dotColor', 'bg-[var(--accent-green)]')
    fixture.componentRef.setInput('valueColor', 'text-[var(--accent-green)]')
    fixture.componentRef.setInput('changeColor', 'text-[var(--accent-green)]')
    fixture.detectChanges()

    const element = fixture.nativeElement as HTMLElement
    expect(element.textContent).toContain('approved')
    expect(element.textContent).toContain('128')
    expect(element.textContent).toContain('++ 8 this_week')
  })
})
```

**Verify:** `bun run --cwd apps/web test -- --include src/app/pages/dashboard/metric-card.spec.ts`
**Commit:** `feat(web): add metric card component`

### Task 3.3: Create StandupTable leaf component
**File:** `apps/web/src/app/pages/dashboard/standup-table.ts`
**Test:** `apps/web/src/app/pages/dashboard/standup-table.spec.ts`
**Depends:** none

I am keeping the table component stateless and button-driven. The page owns routing; the table only formats rows and emits `viewStandup`, which preserves reuse and keeps routing logic out of the leaf component.

```typescript
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core'

import type { Standup, StandupStatus } from '../../types/standup'

@Component({
  selector: 'app-standup-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="border border-[var(--border)] flex flex-col">
      <div class="bg-[var(--bg-surface)] border-b border-[var(--border)] px-[20px] py-[12px]">
        <div class="grid grid-cols-[120px_120px_1fr_100px]">
          <span class="text-[var(--text-secondary)] font-[var(--font-jetbrains)] text-[12px] font-medium">date</span>
          <span class="text-[var(--text-secondary)] font-[var(--font-jetbrains)] text-[12px] font-medium">status</span>
          <span class="text-[var(--text-secondary)] font-[var(--font-jetbrains)] text-[12px] font-medium">content_preview</span>
          <span class="text-[var(--text-secondary)] font-[var(--font-jetbrains)] text-[12px] font-medium">actions</span>
        </div>
      </div>

      @for (standup of standups(); track standup.id) {
        <div class="border-b border-[var(--border)] px-[20px] py-[16px] grid grid-cols-[120px_120px_1fr_100px] items-center">
          <span class="text-[var(--text-primary)] font-[var(--font-jetbrains)] text-[13px]">{{ standup.date }}</span>
          <span class="font-[var(--font-jetbrains)] text-[12px]" [class]="statusBadgeClass(standup.status)">
            {{ formatStatus(standup.status) }}
          </span>
          <span class="text-[var(--text-secondary)] font-[var(--font-ibm)] text-[13px]">{{ standup.contentPreview }}</span>
          <button
            type="button"
            class="text-left text-[var(--accent-green)] font-[var(--font-jetbrains)] text-[12px]"
            (click)="viewStandup.emit(standup.id)"
          >
            $ view >>
          </button>
        </div>
      }

      <div class="px-[20px] py-[16px] flex items-center justify-between">
        <span class="text-[var(--text-secondary)] font-[var(--font-ibm)] text-[12px]">
          // showing 1-{{ standups().length }} of {{ total() }} standups
        </span>
        <div class="flex items-center gap-[8px]">
          <span class="text-[var(--text-secondary)] font-[var(--font-jetbrains)] text-[12px]"><<</span>
          <span class="text-[var(--text-primary)] font-[var(--font-jetbrains)] text-[12px]">[1]</span>
          <span class="text-[var(--text-secondary)] font-[var(--font-jetbrains)] text-[12px]">[2]</span>
          <span class="text-[var(--text-secondary)] font-[var(--font-jetbrains)] text-[12px]">[3]</span>
          <span class="text-[var(--text-secondary)] font-[var(--font-jetbrains)] text-[12px]">>></span>
        </div>
      </div>
    </div>
  `,
})
export class StandupTable {
  readonly standups = input.required<Standup[]>()
  readonly total = input.required<number>()
  readonly viewStandup = output<string>()

  statusBadgeClass(status: StandupStatus) {
    if (status === 'approved') return 'text-[var(--accent-green)]'
    if (status === 'pending_review') return 'text-[var(--accent-cyan)]'
    return 'text-[var(--accent-amber)]'
  }

  formatStatus(status: StandupStatus) {
    if (status === 'pending_review') return '[pending]'
    return status === 'approved' ? '[approved]' : '[rejected]'
  }
}
```

```typescript
import { TestBed } from '@angular/core/testing'
import { vi } from 'vitest'

import type { Standup } from '../../types/standup'
import { StandupTable } from './standup-table'

describe('StandupTable', () => {
  it('renders rows and emits selected standup ids', async () => {
    await TestBed.configureTestingModule({
      imports: [StandupTable],
    }).compileComponents()

    const fixture = TestBed.createComponent(StandupTable)
    const emitSpy = vi.fn()
    const standups: Standup[] = [
      {
        id: '7f3a2b1c',
        date: '2026-03-09',
        status: 'pending_review',
        createdAt: '17:32',
        contentPreview: 'implemented retry logic...',
        sections: [],
        sources: [],
      },
    ]

    fixture.componentRef.setInput('standups', standups)
    fixture.componentRef.setInput('total', 1)
    fixture.componentInstance.viewStandup.subscribe(emitSpy)
    fixture.detectChanges()

    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement
    button.click()

    expect(fixture.nativeElement.textContent).toContain('implemented retry logic')
    expect(emitSpy).toHaveBeenCalledWith('7f3a2b1c')
  })
})
```

**Verify:** `bun run --cwd apps/web test -- --include src/app/pages/dashboard/standup-table.spec.ts`
**Commit:** `feat(web): add standup table component`

### Task 3.4: Create FilterBar leaf component
**File:** `apps/web/src/app/pages/dashboard/filter-bar.ts`
**Test:** `apps/web/src/app/pages/dashboard/filter-bar.spec.ts`
**Depends:** none

The design only needs a local filter UI shell. I am implementing it with local signals and output emitters so the dashboard page can own the filtering policy while the bar owns its interaction state.

```typescript
import { ChangeDetectionStrategy, Component, output, signal } from '@angular/core'

@Component({
  selector: 'app-filter-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-[16px]">
      <div class="text-[var(--text-secondary)] font-[var(--font-jetbrains)] text-[12px]">// filters</div>
      <div class="flex items-center gap-[16px]">
        <button
          type="button"
          class="border border-[var(--border)] px-[16px] py-[8px] flex items-center gap-[8px] font-[var(--font-jetbrains)] text-[13px] text-[var(--text-primary)]"
          (click)="cycleStatus()"
        >
          <span class="text-[var(--text-secondary)]">/</span>
          <span>status: {{ status() }}</span>
        </button>

        <button
          type="button"
          class="border border-[var(--border)] px-[16px] py-[8px] flex items-center gap-[8px] font-[var(--font-jetbrains)] text-[13px] text-[var(--text-primary)]"
          (click)="cycleDate()"
        >
          <span class="text-[var(--text-secondary)]">/</span>
          <span>date: {{ date() }}</span>
        </button>

        <div class="flex-1 border border-[var(--border)] px-[16px] py-[8px] flex items-center gap-[8px]">
          <span class="text-[var(--text-secondary)] font-[var(--font-jetbrains)] text-[13px]">/</span>
          <input
            type="text"
            placeholder="search standups..."
            class="flex-1 bg-transparent font-[var(--font-jetbrains)] text-[13px] text-[var(--text-tertiary)] outline-none"
            aria-label="Search standups"
            [value]="search()"
            (input)="updateSearch($any($event.target).value)"
          />
        </div>
      </div>
    </div>
  `,
})
export class FilterBar {
  readonly statusChange = output<string>()
  readonly dateChange = output<string>()
  readonly searchChange = output<string>()

  readonly status = signal<'all' | 'pending_review' | 'approved' | 'rejected'>('all')
  readonly date = signal<'this_week' | '2026-03-09' | '2026-03-08'>('this_week')
  readonly search = signal('')

  cycleStatus() {
    const next =
      this.status() === 'all'
        ? 'pending_review'
        : this.status() === 'pending_review'
          ? 'approved'
          : this.status() === 'approved'
            ? 'rejected'
            : 'all'

    this.status.set(next)
    this.statusChange.emit(next)
  }

  cycleDate() {
    const next =
      this.date() === 'this_week'
        ? '2026-03-09'
        : this.date() === '2026-03-09'
          ? '2026-03-08'
          : 'this_week'

    this.date.set(next)
    this.dateChange.emit(next)
  }

  updateSearch(value: string) {
    this.search.set(value)
    this.searchChange.emit(value)
  }
}
```

```typescript
import { TestBed } from '@angular/core/testing'
import { vi } from 'vitest'

import { FilterBar } from './filter-bar'

describe('FilterBar', () => {
  it('emits status, date, and search changes', async () => {
    await TestBed.configureTestingModule({
      imports: [FilterBar],
    }).compileComponents()

    const fixture = TestBed.createComponent(FilterBar)
    const statusSpy = vi.fn()
    const dateSpy = vi.fn()
    const searchSpy = vi.fn()

    fixture.componentInstance.statusChange.subscribe(statusSpy)
    fixture.componentInstance.dateChange.subscribe(dateSpy)
    fixture.componentInstance.searchChange.subscribe(searchSpy)
    fixture.detectChanges()

    const [statusButton, dateButton] = fixture.nativeElement.querySelectorAll('button')
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement

    statusButton.click()
    dateButton.click()
    input.value = 'retry'
    input.dispatchEvent(new Event('input'))

    expect(statusSpy).toHaveBeenCalledWith('pending_review')
    expect(dateSpy).toHaveBeenCalledWith('2026-03-09')
    expect(searchSpy).toHaveBeenCalledWith('retry')
  })
})
```

**Verify:** `bun run --cwd apps/web test -- --include src/app/pages/dashboard/filter-bar.spec.ts`
**Commit:** `feat(web): add dashboard filter bar component`

---

## Batch 4: Page Composition + Polish (parallel - 4 implementers)

These tasks consume the new service/components and finish the conformance fixes.

### Task 4.1: Turn DashboardPage into an orchestrator
**File:** `apps/web/src/app/pages/dashboard/dashboard-page.ts`
**Test:** `apps/web/src/app/pages/dashboard/dashboard-page.spec.ts`
**Depends:** 3.1, 3.2, 3.3, 3.4

Design requires component extraction without visual drift. I am keeping the existing page chrome intact, moving metrics/table/filters into leaf components, and implementing filter state locally with `computed()` so the page remains the only coordinator.

```typescript
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core'
import { Router } from '@angular/router'

import { SidebarLayout } from '../../layout/sidebar'
import { StandupService } from '../../services/standup.service'
import { FilterBar } from './filter-bar'
import { MetricCard } from './metric-card'
import { StandupTable } from './standup-table'

@Component({
  selector: 'app-dashboard-page',
  imports: [SidebarLayout, MetricCard, StandupTable, FilterBar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sidebar-layout>
      <section class="min-h-screen bg-[var(--bg-page)] text-[var(--text-primary)] p-[40px] flex flex-col gap-[40px]">
        <div class="flex flex-col gap-[8px]">
          <div class="flex items-center gap-[12px]">
            <span class="text-[var(--accent-green)] font-[var(--font-jetbrains)] text-[32px] font-bold">>></span>
            <span class="text-[var(--text-primary)] font-[var(--font-jetbrains)] text-[28px] font-bold">standups</span>
          </div>
          <div class="text-[var(--text-secondary)] font-[var(--font-ibm)] text-[14px]">
            // daily standup reports overview
          </div>
        </div>

        @if (standupService.standups.isLoading()) {
          <div class="text-[var(--text-secondary)] font-[var(--font-ibm)] text-[13px]">// loading standups...</div>
        } @else if (standupService.standups.error()) {
          <div class="text-[var(--accent-red)] font-[var(--font-ibm)] text-[13px]">// failed to load standups</div>
        } @else {
          <div class="grid grid-cols-4 gap-[24px]">
            @for (card of metricCards(); track card.label) {
              <app-metric-card
                [label]="card.label"
                [value]="card.value"
                [change]="card.change"
                [dotColor]="card.dotColor"
                [valueColor]="card.valueColor"
                [changeColor]="card.changeColor"
              />
            }
          </div>

          <app-filter-bar
            (statusChange)="statusFilter.set($event)"
            (dateChange)="dateFilter.set($event)"
            (searchChange)="searchFilter.set($event)"
          />

          <app-standup-table
            [standups]="visibleStandups()"
            [total]="filteredStandups().length"
            (viewStandup)="openStandup($event)"
          />
        }
      </section>
    </app-sidebar-layout>
  `,
})
export class DashboardPage {
  readonly standupService = inject(StandupService)
  private readonly router = inject(Router)

  readonly statusFilter = signal('all')
  readonly dateFilter = signal('this_week')
  readonly searchFilter = signal('')

  readonly filteredStandups = computed(() => {
    const search = this.searchFilter().trim().toLowerCase()

    return this.standupService.standups.value().filter((standup) => {
      const matchesStatus =
        this.statusFilter() === 'all' ? true : standup.status === this.statusFilter()
      const matchesDate =
        this.dateFilter() === 'this_week'
          ? standup.date >= '2026-03-03'
          : standup.date === this.dateFilter()
      const matchesSearch =
        search.length === 0
          ? true
          : `${standup.id} ${standup.contentPreview}`
              .toLowerCase()
              .includes(search)

      return matchesStatus && matchesDate && matchesSearch
    })
  })

  readonly visibleStandups = computed(() => this.filteredStandups().slice(0, 5))

  readonly metricCards = computed(() => {
    const metrics = this.standupService.metrics()

    return [
      {
        label: 'total_standups',
        value: metrics.total.count,
        change: metrics.total.change,
        dotColor: 'bg-[var(--text-secondary)]',
        valueColor: 'text-[var(--text-primary)]',
        changeColor: 'text-[var(--text-secondary)]',
      },
      {
        label: 'approved',
        value: metrics.approved.count,
        change: metrics.approved.change,
        dotColor: 'bg-[var(--accent-green)]',
        valueColor: 'text-[var(--accent-green)]',
        changeColor: 'text-[var(--accent-green)]',
      },
      {
        label: 'pending_review',
        value: metrics.pending.count,
        change: metrics.pending.change,
        dotColor: 'bg-[var(--accent-cyan)]',
        valueColor: 'text-[var(--accent-cyan)]',
        changeColor: 'text-[var(--text-secondary)]',
      },
      {
        label: 'rejected',
        value: metrics.rejected.count,
        change: metrics.rejected.change,
        dotColor: 'bg-[var(--accent-amber)]',
        valueColor: 'text-[var(--accent-amber)]',
        changeColor: 'text-[var(--text-secondary)]',
      },
    ]
  })

  openStandup(id: string) {
    void this.router.navigate(['/standups', id])
  }
}
```

```typescript
import {
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http'
import { TestBed, fakeAsync, tick } from '@angular/core/testing'
import { provideRouter } from '@angular/router'

import { mockApiInterceptor, resetMockApiState } from '../../interceptors/mock-api.interceptor'
import { DashboardPage } from './dashboard-page'

describe('DashboardPage', () => {
  it('renders the dashboard header', async () => {
    resetMockApiState()
    await TestBed.configureTestingModule({
      imports: [DashboardPage],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([mockApiInterceptor])),
      ],
    }).compileComponents()

    const fixture = TestBed.createComponent(DashboardPage)
    fixture.detectChanges()
    tick(700)
    fixture.detectChanges()

    const element = fixture.nativeElement as HTMLElement
    expect(element.textContent).toContain('standups')
    expect(element.textContent).toContain('daily standup reports overview')
  })
})
```

**Verify:** `bun run --cwd apps/web test -- --include src/app/pages/dashboard/dashboard-page.spec.ts`
**Commit:** `refactor(web): extract dashboard leaf components`

### Task 4.2: Fix StandupDetailPage signal/routing flow
**File:** `apps/web/src/app/pages/standup-detail/standup-detail-page.ts`
**Test:** `apps/web/src/app/pages/standup-detail/standup-detail-page.spec.ts`
**Depends:** 3.1

Design requires the route param to be mandatory and the detail page to use resource-native loading/error states. I am implementing `input.required<string>()`, `StandupService.getStandupById(this.id)`, and explicit detail reloads after mutations so the page stays synchronized without manual local state.

```typescript
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
} from '@angular/core'
import { RouterLink } from '@angular/router'

import { SidebarLayout } from '../../layout/sidebar'
import { StandupService } from '../../services/standup.service'
import type { StandupSectionTone, StandupStatus } from '../../types/standup'

@Component({
  selector: 'app-standup-detail-page',
  imports: [SidebarLayout, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sidebar-layout>
      <section class="min-h-screen bg-[var(--bg-page)] text-[var(--text-primary)] p-[40px] flex flex-col gap-[32px]">
        <a routerLink="/dashboard" class="text-[var(--text-secondary)] font-[var(--font-jetbrains)] text-[12px] flex items-center gap-[12px]">
          <span><<</span>
          <span>back to standups</span>
        </a>

        @if (standup.isLoading()) {
          <div class="text-[var(--text-secondary)] font-[var(--font-ibm)] text-[13px]">// loading standup detail...</div>
        } @else if (standup.error()) {
          <div class="text-[var(--accent-red)] font-[var(--font-ibm)] text-[13px]">// standup not found</div>
        } @else if (standup.value(); as detail) {
          <div class="flex flex-col gap-[16px]">
            <div class="flex items-center gap-[12px]">
              <span class="text-[var(--accent-green)] font-[var(--font-jetbrains)] text-[32px] font-bold">>></span>
              <span class="text-[var(--text-primary)] font-[var(--font-jetbrains)] text-[28px] font-bold">standup_detail</span>
            </div>
            <div class="flex items-center gap-[24px]">
              <span class="text-[var(--text-secondary)] font-[var(--font-ibm)] text-[12px]">// {{ detail.date }}</span>
              <div class="flex items-center gap-[8px]">
                <span class="h-[6px] w-[6px] rounded-full" [class]="statusDotClass(detail.status)"></span>
                <span class="font-[var(--font-jetbrains)] text-[12px]" [class]="statusTextClass(detail.status)">
                  {{ formatStatus(detail.status) }}
                </span>
              </div>
              <span class="text-[var(--text-secondary)] font-[var(--font-ibm)] text-[12px]">created: {{ detail.createdAt }}</span>
              <span class="text-[var(--text-tertiary)] font-[var(--font-ibm)] text-[12px]">id: {{ detail.id }}</span>
            </div>
          </div>

          <div class="bg-[var(--bg-surface)] border border-[var(--border)] p-[24px] flex flex-col gap-[20px]">
            @for (section of detail.sections; track section.title) {
              <div class="flex flex-col gap-[8px]">
                <div class="text-[var(--text-emphasis)] font-[var(--font-jetbrains)] text-[14px] font-bold">{{ section.title }}</div>
                @for (item of section.items; track item) {
                  <div class="font-[var(--font-ibm)] text-[13px] leading-[1.6]" [class]="sectionToneClass(section.tone)">
                    {{ item }}
                  </div>
                }
              </div>
            }
          </div>

          <div class="border border-[var(--border)] p-[20px] flex flex-col gap-[20px]">
            @for (repo of detail.sources; track repo.name) {
              <div class="flex flex-col gap-[8px]">
                <div class="text-[var(--accent-green)] font-[var(--font-jetbrains)] text-[13px] font-medium">{{ repo.name }}</div>
                @for (commit of repo.commits; track commit.hash) {
                  <div class="flex gap-[12px] pl-[16px]">
                    <span class="text-[var(--text-tertiary)] font-[var(--font-jetbrains)] text-[12px]">{{ commit.hash }}</span>
                    <span class="text-[var(--text-primary)] font-[var(--font-ibm)] text-[12px]">{{ commit.message }}</span>
                  </div>
                }
              </div>
            }
          </div>

          <div class="flex items-center gap-[16px]">
            <button
              type="button"
              class="bg-[var(--accent-green)] border border-[var(--accent-green)] px-[20px] py-[10px] text-[var(--bg-page)] font-[var(--font-jetbrains)] text-[12px] font-medium"
              (click)="approve(detail.id)"
            >
              $ approve
            </button>
            <button
              type="button"
              class="border border-[var(--accent-red)] px-[20px] py-[10px] text-[var(--accent-red)] font-[var(--font-jetbrains)] text-[12px] font-medium"
              (click)="reject(detail.id)"
            >
              $ reject
            </button>
            <button
              type="button"
              class="border border-[var(--accent-cyan)] px-[20px] py-[10px] text-[var(--accent-cyan)] font-[var(--font-jetbrains)] text-[12px] font-medium"
              (click)="regenerate(detail.id)"
            >
              $ regenerate
            </button>
          </div>
        } @else {
          <div class="text-[var(--text-secondary)] font-[var(--font-ibm)] text-[13px]">// standup not found</div>
        }
      </section>
    </app-sidebar-layout>
  `,
})
export class StandupDetailPage {
  private readonly standupService = inject(StandupService)

  readonly id = input.required<string>()
  readonly standup = this.standupService.getStandupById(this.id)

  async approve(id: string) {
    await this.standupService.approve(id)
    this.standup.reload()
  }

  async reject(id: string) {
    await this.standupService.reject(id)
    this.standup.reload()
  }

  async regenerate(id: string) {
    await this.standupService.regenerate(id)
    this.standup.reload()
  }

  statusDotClass(status: StandupStatus) {
    if (status === 'approved') return 'bg-[var(--accent-green)]'
    if (status === 'pending_review') return 'bg-[var(--accent-cyan)]'
    return 'bg-[var(--accent-amber)]'
  }

  statusTextClass(status: StandupStatus) {
    if (status === 'approved') return 'text-[var(--accent-green)]'
    if (status === 'pending_review') return 'text-[var(--accent-cyan)]'
    return 'text-[var(--accent-amber)]'
  }

  formatStatus(status: StandupStatus) {
    if (status === 'pending_review') return '[pending_review]'
    return status === 'approved' ? '[approved]' : '[rejected]'
  }

  sectionToneClass(tone: StandupSectionTone) {
    if (tone === 'cyan') return 'text-[var(--accent-cyan)]'
    if (tone === 'muted') return 'text-[var(--text-secondary)]'
    return 'text-[var(--text-primary)]'
  }
}
```

```typescript
import {
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http'
import { TestBed, fakeAsync, tick } from '@angular/core/testing'
import { provideRouter } from '@angular/router'

import { mockApiInterceptor, resetMockApiState } from '../../interceptors/mock-api.interceptor'
import { StandupDetailPage } from './standup-detail-page'

describe('StandupDetailPage', () => {
  it('renders detail header', async () => {
    resetMockApiState()
    await TestBed.configureTestingModule({
      imports: [StandupDetailPage],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([mockApiInterceptor])),
      ],
    }).compileComponents()

    const fixture = TestBed.createComponent(StandupDetailPage)
    fixture.componentRef.setInput('id', '7f3a2b1c')
    fixture.detectChanges()
    tick(700)
    fixture.detectChanges()

    const element = fixture.nativeElement as HTMLElement
    expect(element.textContent).toContain('standup_detail')
  })
})
```

**Verify:** `bun run --cwd apps/web test -- --include src/app/pages/standup-detail/standup-detail-page.spec.ts`
**Commit:** `refactor(web): make standup detail route signal-safe`

### Task 4.3: Deduplicate sidebar class bindings
**File:** `apps/web/src/app/layout/sidebar.ts`
**Test:** `apps/web/src/app/layout/sidebar.spec.ts`
**Depends:** none

Design calls out duplicated active/inactive class strings. I am implementing tiny helper methods and shared constants instead of `ngClass`, which keeps the template readable and matches the local AGENTS rule set.

```typescript
import { ChangeDetectionStrategy, Component } from '@angular/core'
import { RouterLink, RouterLinkActive } from '@angular/router'

@Component({
  selector: 'app-sidebar-layout',
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen w-full bg-[var(--bg-page)] text-[var(--text-primary)] flex">
      <aside class="w-[240px] border-r border-[var(--border)] px-[24px] py-[32px] flex flex-col justify-between">
        <div class="flex flex-col gap-[32px]">
          <div class="flex items-center gap-[8px]">
            <span class="text-[var(--accent-green)] font-[var(--font-jetbrains)] text-[20px] font-bold">>></span>
            <span class="text-[var(--text-primary)] font-[var(--font-jetbrains)] text-[18px] font-medium">standup_bot</span>
          </div>

          <nav class="flex flex-col gap-[4px]">
            <a
              routerLink="/dashboard"
              routerLinkActive
              #dashActive="routerLinkActive"
              [class]="navItemClass(dashActive.isActive)"
              [attr.aria-current]="dashActive.isActive ? 'page' : null"
            >
              <span [class]="navPrefixClass(dashActive.isActive)">$</span>
              <span [class]="navLabelClass(dashActive.isActive)">dashboard</span>
            </a>

            <a
              routerLink="/settings"
              routerLinkActive
              #settingsActive="routerLinkActive"
              [class]="navItemClass(settingsActive.isActive)"
              [attr.aria-current]="settingsActive.isActive ? 'page' : null"
            >
              <span [class]="navPrefixClass(settingsActive.isActive)">$</span>
              <span [class]="navLabelClass(settingsActive.isActive)">settings</span>
            </a>

            <button
              type="button"
              class="flex items-center gap-[8px] px-[12px] py-[8px] text-[var(--text-secondary)] font-[var(--font-jetbrains)] text-[13px] cursor-not-allowed opacity-70"
              aria-disabled="true"
            >
              <span>$</span>
              <span>reports</span>
            </button>
          </nav>
        </div>

        <main class="flex flex-col gap-[16px]">
          <div class="border border-[var(--border)] p-[16px] flex flex-col gap-[8px]">
            <span class="text-[var(--accent-amber)] font-[var(--font-jetbrains)] text-[12px]">[!] upgrade available</span>
            <span class="text-[var(--text-secondary)] font-[var(--font-ibm)] text-[12px]">// premium features unlocked</span>
          </div>

          <div class="flex items-center gap-[8px]">
            <span class="h-[8px] w-[8px] rounded-full bg-[var(--accent-green)]"></span>
            <div class="flex flex-col gap-[2px]">
              <span class="text-[var(--text-primary)] font-[var(--font-jetbrains)] text-[13px]">nitoba/</span>
              <span class="text-[var(--text-secondary)] font-[var(--font-ibm)] text-[12px]">online</span>
            </div>
          </div>
        </main>
      </aside>

      <main class="flex-1">
        <ng-content></ng-content>
      </main>
    </div>
  `,
})
export class SidebarLayout {
  private readonly navBaseClass = 'flex items-center gap-[8px] px-[12px] py-[8px]'
  private readonly navActiveClass = ' bg-[var(--bg-active)]'
  private readonly navPrefixBaseClass = 'font-[var(--font-jetbrains)] text-[13px]'
  private readonly navLabelBaseClass = 'font-[var(--font-jetbrains)] text-[13px]'

  navItemClass(isActive: boolean) {
    return isActive ? this.navBaseClass + this.navActiveClass : this.navBaseClass
  }

  navPrefixClass(isActive: boolean) {
    return `${this.navPrefixBaseClass} ${isActive ? 'text-[var(--accent-green)]' : 'text-[var(--text-secondary)]'}`
  }

  navLabelClass(isActive: boolean) {
    return `${this.navLabelBaseClass} ${isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`
  }
}
```

```typescript
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'

import { SidebarLayout } from './sidebar'

describe('SidebarLayout', () => {
  it('renders navigation and projects content', async () => {
    await TestBed.configureTestingModule({
      imports: [SidebarLayout],
      providers: [provideRouter([])],
    }).compileComponents()

    const fixture = TestBed.createComponent(SidebarLayout)
    fixture.detectChanges()

    const element = fixture.nativeElement as HTMLElement
    expect(element.textContent).toContain('standup_bot')
    expect(element.textContent).toContain('dashboard')
  })
})
```

**Verify:** `bun run --cwd apps/web test -- --include src/app/layout/sidebar.spec.ts`
**Commit:** `refactor(web): simplify sidebar active class bindings`

### Task 4.4: Add switch semantics to settings toggles
**File:** `apps/web/src/app/pages/settings/settings-page.ts`
**Test:** `apps/web/src/app/pages/settings/settings-page.spec.ts`
**Depends:** none

Design requires WCAG-friendly toggle semantics. I am keeping the current visual switch intact and adding `role="switch"` plus `aria-checked`, because that is the lowest-risk accessibility fix without redesigning the control.

```typescript
import { ChangeDetectionStrategy, Component, signal } from '@angular/core'

import { SidebarLayout } from '../../layout/sidebar'

type NotificationSetting = {
  id: string
  label: string
  description: string
  enabled: boolean
}

@Component({
  selector: 'app-settings-page',
  imports: [SidebarLayout],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sidebar-layout>
      <section class="min-h-screen bg-[var(--bg-page)] text-[var(--text-primary)] p-[40px] flex flex-col gap-[40px]">
        <div class="flex flex-col gap-[8px]">
          <div class="flex items-center gap-[12px]">
            <span class="text-[var(--accent-green)] font-[var(--font-jetbrains)] text-[28px] font-bold">>></span>
            <span class="text-[var(--text-primary)] font-[var(--font-jetbrains)] text-[28px] font-bold">settings</span>
          </div>
          <div class="text-[var(--text-secondary)] font-[var(--font-ibm)] text-[14px]">
            // configure your standup automation preferences
          </div>
        </div>

        <div class="border border-[var(--border)] p-[24px] flex flex-col gap-[16px]">
          <div class="flex items-center gap-[8px]">
            <span class="text-[var(--text-tertiary)] font-[var(--font-jetbrains)] text-[14px]">//</span>
            <span class="text-[var(--text-emphasis)] font-[var(--font-jetbrains)] text-[14px] font-medium">notifications</span>
          </div>
          <div class="flex flex-col gap-[16px]">
            @for (item of notifications(); track item.id) {
              <div class="flex items-center justify-between">
                <div class="flex flex-col gap-[2px]">
                  <span class="text-[var(--text-primary)] font-[var(--font-jetbrains)] text-[13px]">{{ item.label }}</span>
                  <span class="text-[var(--text-secondary)] font-[var(--font-ibm)] text-[12px]">{{ item.description }}</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  class="w-[40px] h-[22px] rounded-full px-[3px] flex items-center"
                  [attr.aria-label]="'Toggle ' + item.label"
                  [attr.aria-checked]="item.enabled"
                  [class]="item.enabled
                    ? 'w-[40px] h-[22px] rounded-full px-[3px] flex items-center justify-end bg-[var(--accent-green)]'
                    : 'w-[40px] h-[22px] rounded-full px-[3px] flex items-center justify-start bg-[var(--border)]'"
                  (click)="toggleNotification(item.id)"
                >
                  <span class="h-[16px] w-[16px] rounded-full bg-white"></span>
                </button>
              </div>
            }
          </div>
        </div>
      </section>
    </app-sidebar-layout>
  `,
})
export class SettingsPage {
  readonly notifications = signal<NotificationSetting[]>([
    {
      id: 'active',
      label: 'active',
      description: 'enable automatic standup generation',
      enabled: true,
    },
    {
      id: 'discord_dm_preview',
      label: 'discord_dm_preview',
      description: 'receive dm with standup preview before publishing',
      enabled: true,
    },
  ])

  toggleNotification(id: string) {
    this.notifications.update((items) =>
      items.map((item) =>
        item.id === id ? { ...item, enabled: !item.enabled } : item,
      ),
    )
  }
}
```

```typescript
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'

import { SettingsPage } from './settings-page'

describe('SettingsPage', () => {
  it('renders settings title and switch semantics', async () => {
    await TestBed.configureTestingModule({
      imports: [SettingsPage],
      providers: [provideRouter([])],
    }).compileComponents()

    const fixture = TestBed.createComponent(SettingsPage)
    fixture.detectChanges()

    const element = fixture.nativeElement as HTMLElement
    const switchButton = element.querySelector('[role="switch"]')

    expect(element.textContent).toContain('settings')
    expect(switchButton?.getAttribute('aria-checked')).toBe('true')
  })
})
```

**Verify:** `bun run --cwd apps/web test -- --include src/app/pages/settings/settings-page.spec.ts`
**Commit:** `fix(web): add switch semantics to settings toggles`

---

## Implementation Notes

- `FutureAuthService` is intentionally local to `auth.guard.ts`; the design only needs a skeleton, and this avoids prematurely inventing a wider auth module.
- `StandupService.getStandupById()` accepts a signal-like getter (`() => string | undefined`) so `input.required()` can be passed directly from the detail page.
- `mockApiInterceptor` owns in-memory mutation state plus `resetMockApiState()` because Vitest runs specs in-process and needs deterministic fixture resets.
- `DashboardPage` keeps filter behavior local instead of pushing query params into the service; the design only called for extraction and HTTP list loading, not URL-synced filtering.
- `StandupDetailPage` explicitly reloads its resource after approve/reject/regenerate because list reload alone would not refresh the separate detail `httpResource()` instance.

## Final Verification

Run the full web test pass once all batches land:

```bash
bun run --cwd apps/web test
```

Then do a final smoke check in the browser:

```bash
bun run --cwd apps/web start
```
