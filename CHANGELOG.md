# Changelog

## Unreleased


### Chores

- Chore(config): add ATER-DIGITAL to default Azure DevOps projects (`d762c79`)


## 0.2.1 — 2026-04-06


### Chores

- Chore(release): prepare v0.2.1 with libsql migration fix (`791d625`)

- Chore: bump version to v0.2.0 (`fab1168`)


## 0.2.0 — 2026-04-06


### Features

- Feat: migrate standup agent to Mastra and DM-only delivery (#49) (`444797d`)

- Feat: migrate pi-agent-core to Mastra agents (#48) (`6eb5a5d`)


## 0.1.4 — 2026-04-03


### Bug Fixes

- Fix: skip reminder DM when standup already approved or published (`c91876d`)


### Chores

- Chore: bump version to v0.1.4 (#47) (`4d0d7d2`)


## 0.1.3 — 2026-04-03


### Bug Fixes

- Fix: skip lifecycle scripts during Docker install to prevent better-sqlite3 hang (`af02e35`)

- Fix: explicitly trigger CI/CD workflow after auto-tag creation (`2a53039`)


### Chores

- Chore: bump version to v0.1.3 (#46) (`47498b5`)


## 0.1.2 — 2026-04-03


### Bug Fixes

- Fix: disable lifecycle scripts to prevent better-sqlite3 build hang (`ebbfdbe`)


### Chores

- Chore: bump version to v0.1.2 (#45) (`b48b719`)


## 0.1.1 — 2026-04-03


### Bug Fixes

- Fix: cache bun install packages in Docker build to prevent CI hangs (`6ed7cc0`)


### Chores

- Chore: bump version to v0.1.1 (#44) (`370a026`)

- Chore: update IA files (`30003ba`)


### Documentation

- Docs: update infra.md with release workflow and tag-based deploy (`0477c1a`)


## 0.1.0 — 2026-04-03


### Bug Fixes

- Fix: use GH_PAT secret to trigger workflows on auto-created tags (`0fdcace`)

- Fix: improve release.sh warnings and cliff.toml changelog quality (`eb7274a`)

- Fix: trigger build and deploy only on release tags, not on every push to main (#42) (`80966b9`)

- Fix: improve standup generation accuracy (#38) (`d47a54a`)

- Fix: resolve 8 high-severity reliability bugs from audit (TAS-57 to TAS-64) (#31) (`b07fd9c`)

- Fix: resolve 5 urgent reliability bugs from audit TAS-32 (#30) (`fc5b846`)

- Fix: rejected standup now generates from scratch instead of reusing previous source data (TAS-106) (#29) (`ab4b7de`)

- Fix(config): correct boolean env var parsing and add TLS configuration (`32d4c77`)

- Fix(email): validate email payload before sending in digest job (`7d9e844`)

- Fix: enforce single Done/In Progress section per project in standup output (TAS-14) (`7f72546`)

- Fix: exclude test cards from standup output, keep as context only (TAS-13) (`ab365f5`)

- Fix: dismiss reminder DM buttons when standup generation starts (TAS-12) (`57da331`)

- Fix: remove literal 'sem card associado' from generated standup text (TAS-11) (`f31af37`)

- Fix: remove 'Gerar agora' button from reminder embed (TAS-10) (`dd7a2e2`)

- Fix: update CORS_ORIGIN and APP_URL to new standup domain (`c8a7222`)

- Fix: resolve git fetch failures in container (#21) (`83878a9`)

- Fix: add missing 'service' label to API Dockerfile for Kamal deploy (#18) (`94fc179`)

- Fix: add retry with backoff to ssh-keyscan in CI deploy (#17) (`3a1d67b`)

- Fix(ci): cache bun dependencies and pin version to speed up install (#16) (`4455364`)

- Fix: sse events handler (`fd041a3`)

- Fix: make git collector testable outside bun (`3a7d5f1`)

- Fix: relax worker trigger-standup validation to accept non-UUID IDs (#11) (`a88fe53`)

- Fix(web): use variable for upstream to enable DNS resolution per-request (`60de3a6`)

- Fix: copy all workspace package.json files in Dockerfiles for bun --filter (#6) (`3e909ff`)

- Fix: disable font inlining in Angular production build (#5) (`8ce3664`)

- Fix(ci): authenticate docker login before pulling migrate image (`0a27b40`)

- Fix(ci): simplify SSH known_hosts and use accept-new to avoid host key mismatch (`d71d338`)

- Fix(db): format migrate.ts to pass biome check (`8f12d22`)


### CI/CD

- Ci(config): restructure server config to support network-alias (`82cb586`)

- Ci(deploy): add database URL and auth token to workflow env (`c1bdc9e`)

- Ci: add database credentials to deploy workflow (`46865b5`)

- Ci: refactor CI pipeline into reusable workflows and actions (`3aeca18`)

- Ci: add SMTP environment variables to CI workflow (`c67f7a7`)

- Ci: add SMTP environment variables to CI workflow (`9f84a47`)

- Ci: update CI workflow and optimize Docker build for email package (`bbb95f9`)

- Ci(workflows): add Discord notifications to track pipeline progress (`f8c8de3`)

- Ci: add real-time Discord deployment notifications to track service progress (`3e0dc8f`)

- Ci: add Discord deployment notifications to CI workflow (`c93fe96`)

- Ci: create labels and update docker references image (`990bd71`)

- Ci: update ci workflow (`f7d5d29`)

- Ci: update username (`6aa7175`)

- Ci: update ci files (`918f12c`)

- Ci: rename TS_OAUTH_SECRET to TS_OAUTH_CLIENT_SECRET (`3184ba0`)

- Ci: switch build job to sequential image builds to avoid concurrency cancellations (`af53c50`)

- Ci: switch build job to native arm64 runner, drop QEMU (`af36023`)

- Ci: allow build and deploy on workflow_dispatch trigger (`49a7ba2`)

- Ci: trigger pipeline (`b79ec77`)

- Ci: add CI/CD pipeline with Kamal + GHCR + Tailscale (`26a9d5f`)

- Ci: add automated Docker build and Kamal deployment pipeline (`d613bc6`)


### Chores

- Chore: bump version to v0.1.0 (`ba901d0`)

- Chore: make release.sh executable (`f97f379`)

- Chore: merge chore/ci into main (#40) (`6ffa554`)

- Chore: replace AI_PROVIDER_API_KEY with per-provider keys in deploy config (TAS-30) (`a846bb5`)

- Chore(standup-generator): remove unused makeRuntimeConfig from tests (`ae43787`)

- Chore: fix lint and remove unused runtimeConfig from StandupGeneratorService (TAS-30) (`99e0aa2`)

- Chore: add @ai-sdk/groq and @openrouter/ai-sdk-provider dependencies (TAS-30) (`e8fdcdf`)

- Chore(config): switch Linear MCP from local command to remote URL (`070e5c1`)

- Chore: add discord automation env vars to deploy config and CI (#27) (`db22a14`)

- Chore(api): enable Discord gateway by default (`4f1c304`)

- Chore(config): refactor Jaeger port configuration in deploy.infra.yml (`f678773`)

- Chore(db): add libsql client and db:studio script (`9589db7`)

- Chore(deploy): use Docker network aliases for internal service communication (`368c775`)

- Chore(config): remove deprecated ANTHROPIC_API_KEY and AZURE_DEVOPS_ORG_URL env vars (`f289aa8`)

- Chore(config): add .env.example template file (`16a7fb9`)

- Chore(deps): migrate dependencies to use catalog references (`dd5310d`)

- Chore: add structured winston logging (`8756132`)

- Chore: bootstrap standup monorepo foundation (`8aaee6e`)


### Documentation

- Docs: add implementation plan for multi-provider LLM round-robin (TAS-30) (`930b6cb`)

- Docs: address remaining warnings in spec review (TAS-30) (`d9680d5`)

- Docs: fix spec blockers — align with NestJS codebase structure (TAS-30) (`2c69934`)

- Docs: add design spec for multi-provider LLM round-robin (TAS-30) (`e9d08fb`)

- Docs: add standups cross-context communication design (`82d8ece`)

- Docs: add api contexts reorganization design (`48415fb`)

- Docs: update arch design (`d58b3ff`)

- Docs: update claude (`6ad12a1`)

- Docs: update CLAUDE.md to reflect modular handler architecture (`faea066`)


### Features

- Feat: add release strategy with versioning, changelogs, and auto-tagging (#41) (`56d9a48`)

- Feat(dashboard): add sorting, real metric changes, and settings improvements (TAS-87 to TAS-93) (#32) (`2907728`)

- Feat(web): add loading state to Discord send button (`616418e`)

- Feat: refactor StandupGeneratorService to use LlmProviderRegistry with callWithFallback (TAS-30) (`75619b2`)

- Feat: register LlmProviderRegistry in StandupGeneratorModule (TAS-30) (`cb67292`)

- Feat: implement LlmProviderRegistry with round-robin, backoff, and tier fallback (TAS-30) (`3798687`)

- Feat: add per-provider LLM keys and LLM_PROVIDERS_CONFIG (TAS-30) (`804dbac`)

- Feat: add AllProvidersUnavailableError (TAS-30) (`e052b6c`)

- Feat: add send-to-discord button via headless browser automation (TAS-18) (#26) (`1a9524b`)

- Feat(config): add linear MCP server configuration (`30d4ef9`)

- Feat: add copy button for approved standups in dashboard table (TAS-15) (`e8fc7d6`)

- Feat: Azure DevOps board activity collector for non-dev standup generation (#25) (`919006d`)

- Feat: auto-clone repos, refactor git-collector card number extraction (#24) (`3bd5036`)

- Feat: auto-clone repos on settings save with synchronous fallback (#23) (`7e2861a`)

- Feat(api): add OpenAPI spec export and Orval client generation (`d4995e4`)

- Feat(web): add user popover component to sidebar (`39f67a8`)

- Feat: migrate DB to Turso/libSQL and major codebase refactoring (#10) (`81e6bc4`)

- Feat(observability): add span status middleware for error tracking (`0369198`)

- Feat(observability): add span error marking and instrument digest job operations (`f4479bb`)

- Feat(ui): group repositories by project in settings page (`ed930d4`)

- Feat(settings): add email theme option to user settings (`3c723c1`)

- Feat(api): enable digests route with session middleware (`ec81976`)

- Feat: add weekly digest email feature (`6af18a6`)

- Feat(observability): add span status middleware for error tracking (`509ee93`)

- Feat(observability): add span error marking and instrument digest job operations (`097df34`)

- Feat: weekly digest emails with settings UI improvements (#9) (`c841426`)

- Feat: add real-time standup status notifications from Discord to web dashboard (`066e2da`)

- Feat: add SSE endpoint for real-time standup events (`3e26e7e`)

- Feat(observability): add OpenTelemetry distributed tracing with Jaeger (`1b25995`)

- Feat(ui): add skeleton loading components (`5d15f95`)

- Feat: improve standup generation with JSON viewer and merge commit filtering (`1f061c0`)

- Feat(standup): add progress events and conflict detection for same-day standups (`92023a9`)

- Feat(standup-generator): add Google Generative AI as LLM provider (`d121d2e`)

- Feat(web): add SVG favicon and reload cloudflared on deploy (`6a65636`)

- Feat(web): add Angular 21 web application with full standup management (#4) (`3aecb80`)

- Feat(auth): add session-based login/logout with Discord OAuth (`e4fe832`)

- Feat(standup): add adjust standup feature to modify existing standups (`3df95d8`)

- Feat(standup): add adjust standup feature with rewrite capability (`3761ee8`)

- Feat(discord-bot): add custom entries modal to standup approval flow (`aa97b1c`)

- Feat(discord-bot): add copy button to allow copying standup content as plain text (`25b720a`)

- Feat(discord-bot): add /standup services command to check service health status (`ceb13b6`)

- Feat(discord-bot): add confirmation flow to /standup trigger command (`d499657`)

- Feat(worker): add cross-service HTTP contract integration tests (`56ff11c`)

- Feat: add health endpoint to worker and discord-bot for healthchecks (`46075af`)

- Feat: add standup reminder system with Discord DM controls (`9b288ea`)

- Feat(generator): move retry logic into generator with graceful MCP fallback (`d4f82f1`)

- Feat(git-collector): fetch all remote branches to include their commits (`cea49cc`)

- Feat(git-collector): add --all flag to git log to include all branches (`e1e6df2`)

- Feat(standup): add modal-based standup regeneration with extra context (`3d7e6aa`)

- Feat(standup-generator): add content rewriting when standup exceeds character limit (`c32cdbb`)

- Feat(db): implement custom migration runner with bun:sqlite (`0c4a784`)

- Feat: implement manual standup trigger across API, worker, and discord-bot (`83fe334`)

- Feat(api): add standup API routes with list, get-by-id, and status update (`1436d7f`)

- Feat(worker): implement resilient job patterns with retry, locks, and recovery cron (`af9d95d`)

- Feat(discord-bot): add slash commands and job failure notifications (`7c73120`)

- Feat(discord-bot): implement approve/reject/regenerate handlers and channel publishing (`849bffb`)

- Feat(integration): add worker-to-bot notification workflow for standup review (`62f62bf`)

- Feat(standup-generator): add AI-powered standup report generator (`88dfdde`)

- Feat(db): add Drizzle ORM and standup repository (`e120c84`)

- Feat(git-collector): add git-collector package (`47923cd`)


### Refactoring

- Refactor(api): implement TAS-82, TAS-83, TAS-84, TAS-85 (#37) (`e80759e`)

- Refactor(web): split SettingsPage into 5 focused subcomponents (TAS-77) (#36) (`15d9478`)

- Refactor(api): split StandupRepository into read and write repositories (TAS-75) (#35) (`6ddce27`)

- Refactor(web): extract standup mappers and shared status helpers (TAS-76, TAS-78) (#34) (`8621959`)

- Refactor(api): share timezone resolution and standardize UserRepository DbError (TAS-74, TAS-79) (#33) (`ce3650b`)

- Refactor(standup-generator): replace commit-type categories with functional context grouping (`3259dd0`)

- Refactor(api,web): add OpenAPI response DTOs and migrate web to TanStack Query (`98e359d`)

- Refactor(api): convert WorkerRuntimeConfigService to exportable module (`db64af0`)

- Refactor: simplify standup cross-context communication (`9237919`)

- Refactor: keep platform events for facts only (`bbdc5ae`)

- Refactor: make discord handlers delegate standup state changes (`a62b182`)

- Refactor: move standup approval and publication into standups (`5aa9e81`)

- Refactor: replace worker request events with direct calls (`e369238`)

- Refactor: replace standup trigger event requests (`1482b03`)

- Refactor: reorganize api contexts (`001e828`)

- Refactor: add all to new api (`2044888`)

- Refactor(web): remove nginx API proxy and configure direct backend URL (`798dec2`)

- Refactor(nginx): route internal API calls through kamal-proxy (`83ef961`)

- Refactor(ui): replace accent-green with primary color across UI components (`21dc8f4`)

- Refactor(web): reorganize app directory structure into core, features, and shared (`2275f21`)

- Refactor(api): use file imports for avatar asset in auth callback (`ee9f120`)

- Refactor(git-collector): make since period configurable for git log (`49bb412`)

- Refactor(http): extract route handlers into separate modular files (`fb03758`)

- Refactor: switch from Anthropic to Groq AI provider (`e3f3214`)

- Refactor(worker): remove logger from bootstrap (`7b0c6e4`)

- Refactor(discord-bot): split internal routes into modular handlers and services (`9dac82d`)

- Refactor: reorganize monorepo files into context-based directories (`1054b71`)


### Security

- Security: fix 15 findings from security audit (TAS-31) (#28) (`187d23c`)


### Tests

- Test: add integration tests for StandupGeneratorService multi-provider fallback (TAS-30) (`5ab1369`)

- Test(email): add tests for null and undefined email inputs (`6747803`)

- Test: migrate api controller specs to http (`003a5de`)


