---
date: 2026-03-09
topic: "Web App UI Implementation from design.pen"
status: validated
---

# Web App UI Implementation Design

## Problem Statement

The standup bot project has a complete design in `apps/web/design.pen` (4 desktop pages + 2 mobile pages) but the Angular web app is an empty scaffold — just a root component with `<router-outlet />` and no pages, services, or routing. We need to implement the full terminal-themed UI matching the design pixel-for-pixel.

## Constraints

- **Angular v21.2+**: No `standalone: true` (it's default). Use `ChangeDetectionStrategy.OnPush`, signal-based `input()`/`output()`, `inject()` for DI.
- **Templates**: Native control flow only (`@if`, `@for`, `@switch`). No `ngClass`/`ngStyle`.
- **Tailwind CSS v4**: Already configured with `@tailwindcss/postcss`. Use utility classes exclusively.
- **No `any`**: Use `unknown` + type guards when uncertain.
- **Accessibility**: WCAG AA, proper ARIA, keyboard navigation, focus management.
- **Mock data only**: No real API calls yet — use signal-based services with hardcoded data.
- **Desktop-first**: Implement the 4 desktop pages. Mobile pages are out of scope for now.

## Design Tokens (from design.pen variables)

### Colors
| Token | Value | Usage |
|-------|-------|-------|
| `bg-page` | `#0A0A0A` | Page background |
| `bg-surface` | `#0F0F0F` | Card/block backgrounds |
| `bg-active` | `#1F1F1F` | Active nav items, hover states |
| `border` | `#2A2A2A` | All borders (cards, table, inputs) |
| `text-primary` | `#FAFAFA` | Main text |
| `text-secondary` | `#6B7280` | Muted text, labels, comments |
| `text-tertiary` | `#4B5563` | Very faint text, decorative |
| `text-emphasis` | `#FFFFFF` | Headings, emphasis |
| `accent-green` | `#10B981` | Primary accent (approved, buttons, active) |
| `accent-cyan` | `#06B6D4` | Pending/in-progress states |
| `accent-amber` | `#F59E0B` | Warnings, rejected, upgrade notices |
| `accent-red` | `#EF4444` | Danger zone, reject button |

### Typography
| Font | Usage |
|------|-------|
| JetBrains Mono | Headings, nav, buttons, code, labels, badges, table headers |
| IBM Plex Mono | Body text, descriptions, comments, content previews |

### Spacing (from variables)
| Token | Value |
|-------|-------|
| `spacing-xs` | 4px |
| `spacing-sm` | 8px |
| `spacing-md` | 16px |
| `spacing-lg` | 24px |
| `spacing-xl` | 40px |

## Approach

**Single-pass implementation** — build all 4 pages with shared layout in one go, using mock data. The design is well-defined enough that we don't need iterative exploration.

### Why this approach
- The design is fully specified in the .pen file with exact values
- All 4 pages share a common sidebar layout pattern
- Mock data is sufficient — we'll wire up real API calls later
- Getting the full UI up lets us validate the design holistically

## Architecture

### File Structure
```
apps/web/src/
  app/
    app.ts                      # Root component (exists)
    app.html                    # Just <router-outlet /> (exists)
    app.config.ts               # App config with providers (exists, needs update)
    app.routes.ts               # Routes (exists, needs update)
    
    layout/
      sidebar.ts                # Shared sidebar component
    
    pages/
      login/
        login-page.ts           # Login page (full-screen, no sidebar)
      dashboard/
        dashboard-page.ts       # Dashboard with metrics + table
      standup-detail/
        standup-detail-page.ts  # Standup detail view
      settings/
        settings-page.ts        # Settings form
    
    services/
      standup.service.ts        # Mock standup data service
    
    types/
      standup.ts                # Standup interfaces
  
  styles.css                    # Global styles + Tailwind + CSS custom properties
  index.html                    # HTML shell (needs font links + title)
```

### Component Responsibilities

**App (root)** — Just renders `<router-outlet />`. No changes needed.

**Sidebar** — Shared layout component used by Dashboard, Detail, Settings. Contains:
- Logo (`>` prompt + `standup_bot` text)
- Navigation items (dashboard, settings, reports) with active state via route matching
- Bottom section: upgrade notice box + user info with online dot
- Accepts content via `<ng-content>` for the main area

**Login Page** — Full-screen page (no sidebar). Contains:
- Decorative background text (terminal comments scattered)
- Centered login card with logo, tagline, divider, description, Discord OAuth button
- Blinking cursor decorations
- Bottom terminal prompt

**Dashboard Page** — Uses sidebar layout. Contains:
- Page header with `>` prompt + "standups" title
- 4 metrics cards row (total, approved, pending, rejected)
- Filters section (status dropdown, date filter, search input)
- Standups table with header, rows, pagination footer

**Standup Detail Page** — Uses sidebar layout. Contains:
- Back navigation (`<< back to standups`)
- Header with title, date, status badge, created time, ID
- Content block (styled like terminal output with markdown-like sections)
- Source data section (repos + commits)
- Action buttons row (approve, reject, regenerate)

**Settings Page** — Uses sidebar layout. Contains:
- Header with title + subtitle
- Schedule section (cron inputs: standup, reminder, recovery, timezone)
- Git configuration section (author, since period)
- Repositories section (list with remove buttons + add repo button)
- Notifications section (toggle switches)
- Danger zone section (reset/delete buttons)

## Data Flow

All data flows through a single `StandupService` (providedIn: root) that holds mock data in signals:

- `standups: Signal<Standup[]>` — list of all standups
- `metrics: Signal<DashboardMetrics>` — computed metrics from standups
- `getStandupById(id: string): Signal<Standup | undefined>` — lookup by ID

Pages read from the service. Action buttons (approve/reject/regenerate) call service methods that update the signal state locally.

Settings page uses a separate `SettingsService` with signal-based form state — no real persistence yet.

## Routing

| Path | Component | Guard | Notes |
|------|-----------|-------|-------|
| `/login` | LoginPage | none | Full-screen, no sidebar |
| `/dashboard` | DashboardPage | none (future: auth) | Lazy loaded |
| `/standups/:id` | StandupDetailPage | none (future: auth) | Lazy loaded, `:id` bound via `withComponentInputBinding()` |
| `/settings` | SettingsPage | none (future: auth) | Lazy loaded |
| `**` | redirect to `/login` | — | Wildcard fallback |

## Styling Strategy

### Tailwind CSS v4 Custom Theme

Define CSS custom properties in `styles.css` under `@theme` block for all design tokens. This lets us use them as `bg-[var(--bg-page)]` etc. in templates.

### Font Loading

Google Fonts loaded via `<link>` tags in `index.html`:
- JetBrains Mono (weights: 400, 500, 700)
- IBM Plex Mono (weights: 400, 500)

### Terminal Aesthetic Patterns

The design uses consistent terminal-themed patterns:
- `$` prefix on buttons and nav items
- `//` comment-style section labels
- `[brackets]` for status badges
- `>>` for navigation arrows
- `>` as the logo/prompt character
- Monospace fonts everywhere

These are implemented as static text in templates — no special components needed.

## Error Handling

Not applicable for this phase — we're using mock data with no API calls. Error states will be added when we wire up the real API.

## Testing Strategy

No unit tests for this phase. The implementation is purely presentational with mock data. Testing will be:
1. **Build verification**: `bun run build` must succeed with zero errors
2. **Visual verification**: Manual check against design.pen
3. **Typecheck**: `bun run typecheck` must pass

## Open Questions

None — the design is fully specified and we have all the information needed to implement.
