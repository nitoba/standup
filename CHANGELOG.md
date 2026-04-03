# Changelog

## Unreleased


### Bug Fixes

- Trigger build and deploy only on release tags, not on every push to main (#42) (`80966b9`)

- Improve standup generation accuracy (#38) (`d47a54a`)

- Resolve 8 high-severity reliability bugs from audit (TAS-57 to TAS-64) (#31) (`b07fd9c`)

- Resolve 5 urgent reliability bugs from audit TAS-32 (#30) (`fc5b846`)

- Rejected standup now generates from scratch instead of reusing previous source data (TAS-106) (#29) (`ab4b7de`)

- Correct boolean env var parsing and add TLS configuration (`32d4c77`)

- Validate email payload before sending in digest job (`7d9e844`)

- Enforce single Done/In Progress section per project in standup output (TAS-14) (`7f72546`)

- Exclude test cards from standup output, keep as context only (TAS-13) (`ab365f5`)

- Dismiss reminder DM buttons when standup generation starts (TAS-12) (`57da331`)

- Remove literal 'sem card associado' from generated standup text (TAS-11) (`f31af37`)

- Remove 'Gerar agora' button from reminder embed (TAS-10) (`dd7a2e2`)

- Update CORS_ORIGIN and APP_URL to new standup domain (`c8a7222`)

- Resolve git fetch failures in container (#21) (`83878a9`)

- Add missing 'service' label to API Dockerfile for Kamal deploy (#18) (`94fc179`)

- Add retry with backoff to ssh-keyscan in CI deploy (#17) (`3a1d67b`)

- Cache bun dependencies and pin version to speed up install (#16) (`4455364`)

- Sse events handler (`fd041a3`)

- Make git collector testable outside bun (`3a7d5f1`)

- Relax worker trigger-standup validation to accept non-UUID IDs (#11) (`a88fe53`)

- Use variable for upstream to enable DNS resolution per-request (`60de3a6`)

- Copy all workspace package.json files in Dockerfiles for bun --filter (#6) (`3e909ff`)

- Disable font inlining in Angular production build (#5) (`8ce3664`)

- Authenticate docker login before pulling migrate image (`0a27b40`)

- Simplify SSH known_hosts and use accept-new to avoid host key mismatch (`d71d338`)

- Format migrate.ts to pass biome check (`8f12d22`)


### CI/CD

- Restructure server config to support network-alias (`82cb586`)

- Add database URL and auth token to workflow env (`c1bdc9e`)

- Add database credentials to deploy workflow (`46865b5`)

- Refactor CI pipeline into reusable workflows and actions (`3aeca18`)

- Add SMTP environment variables to CI workflow (`c67f7a7`)

- Add SMTP environment variables to CI workflow (`9f84a47`)

- Update CI workflow and optimize Docker build for email package (`bbb95f9`)

- Add Discord notifications to track pipeline progress (`f8c8de3`)

- Add real-time Discord deployment notifications to track service progress (`3e0dc8f`)

- Add Discord deployment notifications to CI workflow (`c93fe96`)

- Create labels and update docker references image (`990bd71`)

- Update ci workflow (`f7d5d29`)

- Update username (`6aa7175`)

- Update ci files (`918f12c`)

- Rename TS_OAUTH_SECRET to TS_OAUTH_CLIENT_SECRET (`3184ba0`)

- Switch build job to sequential image builds to avoid concurrency cancellations (`af53c50`)

- Switch build job to native arm64 runner, drop QEMU (`af36023`)

- Allow build and deploy on workflow_dispatch trigger (`49a7ba2`)

- Trigger pipeline (`b79ec77`)

- Add CI/CD pipeline with Kamal + GHCR + Tailscale (`26a9d5f`)

- Add automated Docker build and Kamal deployment pipeline (`d613bc6`)


### Chores

- Make release.sh executable (`f97f379`)

- Merge chore/ci into main (#40) (`6ffa554`)

- Replace AI_PROVIDER_API_KEY with per-provider keys in deploy config (TAS-30) (`a846bb5`)

- Remove unused makeRuntimeConfig from tests (`ae43787`)

- Fix lint and remove unused runtimeConfig from StandupGeneratorService (TAS-30) (`99e0aa2`)

- Add @ai-sdk/groq and @openrouter/ai-sdk-provider dependencies (TAS-30) (`e8fdcdf`)

- Switch Linear MCP from local command to remote URL (`070e5c1`)

- Add discord automation env vars to deploy config and CI (#27) (`db22a14`)

- Enable Discord gateway by default (`4f1c304`)

- Refactor Jaeger port configuration in deploy.infra.yml (`f678773`)

- Add libsql client and db:studio script (`9589db7`)

- Use Docker network aliases for internal service communication (`368c775`)

- Remove deprecated ANTHROPIC_API_KEY and AZURE_DEVOPS_ORG_URL env vars (`f289aa8`)

- Add .env.example template file (`16a7fb9`)

- Migrate dependencies to use catalog references (`dd5310d`)

- Add structured winston logging (`8756132`)

- Bootstrap standup monorepo foundation (`8aaee6e`)


### Documentation

- Add implementation plan for multi-provider LLM round-robin (TAS-30) (`930b6cb`)

- Address remaining warnings in spec review (TAS-30) (`d9680d5`)

- Fix spec blockers — align with NestJS codebase structure (TAS-30) (`2c69934`)

- Add design spec for multi-provider LLM round-robin (TAS-30) (`e9d08fb`)

- Add standups cross-context communication design (`82d8ece`)

- Add api contexts reorganization design (`48415fb`)

- Update arch design (`d58b3ff`)

- Update claude (`6ad12a1`)

- Update CLAUDE.md to reflect modular handler architecture (`faea066`)


### Features

- Add release strategy with versioning, changelogs, and auto-tagging (#41) (`56d9a48`)

- Add sorting, real metric changes, and settings improvements (TAS-87 to TAS-93) (#32) (`2907728`)

- Add loading state to Discord send button (`616418e`)

- Refactor StandupGeneratorService to use LlmProviderRegistry with callWithFallback (TAS-30) (`75619b2`)

- Register LlmProviderRegistry in StandupGeneratorModule (TAS-30) (`cb67292`)

- Implement LlmProviderRegistry with round-robin, backoff, and tier fallback (TAS-30) (`3798687`)

- Add per-provider LLM keys and LLM_PROVIDERS_CONFIG (TAS-30) (`804dbac`)

- Add AllProvidersUnavailableError (TAS-30) (`e052b6c`)

- Add send-to-discord button via headless browser automation (TAS-18) (#26) (`1a9524b`)

- Add linear MCP server configuration (`30d4ef9`)

- Add copy button for approved standups in dashboard table (TAS-15) (`e8fc7d6`)

- Azure DevOps board activity collector for non-dev standup generation (#25) (`919006d`)

- Auto-clone repos, refactor git-collector card number extraction (#24) (`3bd5036`)

- Auto-clone repos on settings save with synchronous fallback (#23) (`7e2861a`)

- Add OpenAPI spec export and Orval client generation (`d4995e4`)

- Add user popover component to sidebar (`39f67a8`)

- Migrate DB to Turso/libSQL and major codebase refactoring (#10) (`81e6bc4`)

- Add span status middleware for error tracking (`0369198`)

- Add span error marking and instrument digest job operations (`f4479bb`)

- Group repositories by project in settings page (`ed930d4`)

- Add email theme option to user settings (`3c723c1`)

- Enable digests route with session middleware (`ec81976`)

- Add weekly digest email feature (`6af18a6`)

- Add span status middleware for error tracking (`509ee93`)

- Add span error marking and instrument digest job operations (`097df34`)

- Weekly digest emails with settings UI improvements (#9) (`c841426`)

- Add real-time standup status notifications from Discord to web dashboard (`066e2da`)

- Add SSE endpoint for real-time standup events (`3e26e7e`)

- Add OpenTelemetry distributed tracing with Jaeger (`1b25995`)

- Add skeleton loading components (`5d15f95`)

- Improve standup generation with JSON viewer and merge commit filtering (`1f061c0`)

- Add progress events and conflict detection for same-day standups (`92023a9`)

- Add Google Generative AI as LLM provider (`d121d2e`)

- Add SVG favicon and reload cloudflared on deploy (`6a65636`)

- Add Angular 21 web application with full standup management (#4) (`3aecb80`)

- Add session-based login/logout with Discord OAuth (`e4fe832`)

- Add adjust standup feature to modify existing standups (`3df95d8`)

- Add adjust standup feature with rewrite capability (`3761ee8`)

- Add custom entries modal to standup approval flow (`aa97b1c`)

- Add copy button to allow copying standup content as plain text (`25b720a`)

- Add /standup services command to check service health status (`ceb13b6`)

- Add confirmation flow to /standup trigger command (`d499657`)

- Add cross-service HTTP contract integration tests (`56ff11c`)

- Add health endpoint to worker and discord-bot for healthchecks (`46075af`)

- Add standup reminder system with Discord DM controls (`9b288ea`)

- Move retry logic into generator with graceful MCP fallback (`d4f82f1`)

- Fetch all remote branches to include their commits (`cea49cc`)

- Add --all flag to git log to include all branches (`e1e6df2`)

- Add modal-based standup regeneration with extra context (`3d7e6aa`)

- Add content rewriting when standup exceeds character limit (`c32cdbb`)

- Implement custom migration runner with bun:sqlite (`0c4a784`)

- Implement manual standup trigger across API, worker, and discord-bot (`83fe334`)

- Add standup API routes with list, get-by-id, and status update (`1436d7f`)

- Implement resilient job patterns with retry, locks, and recovery cron (`af9d95d`)

- Add slash commands and job failure notifications (`7c73120`)

- Implement approve/reject/regenerate handlers and channel publishing (`849bffb`)

- Add worker-to-bot notification workflow for standup review (`62f62bf`)

- Add AI-powered standup report generator (`88dfdde`)

- Add Drizzle ORM and standup repository (`e120c84`)

- Add git-collector package (`47923cd`)


### Refactoring

- Implement TAS-82, TAS-83, TAS-84, TAS-85 (#37) (`e80759e`)

- Split SettingsPage into 5 focused subcomponents (TAS-77) (#36) (`15d9478`)

- Split StandupRepository into read and write repositories (TAS-75) (#35) (`6ddce27`)

- Extract standup mappers and shared status helpers (TAS-76, TAS-78) (#34) (`8621959`)

- Share timezone resolution and standardize UserRepository DbError (TAS-74, TAS-79) (#33) (`ce3650b`)

- Replace commit-type categories with functional context grouping (`3259dd0`)

- Add OpenAPI response DTOs and migrate web to TanStack Query (`98e359d`)

- Convert WorkerRuntimeConfigService to exportable module (`db64af0`)

- Simplify standup cross-context communication (`9237919`)

- Keep platform events for facts only (`bbdc5ae`)

- Make discord handlers delegate standup state changes (`a62b182`)

- Move standup approval and publication into standups (`5aa9e81`)

- Replace worker request events with direct calls (`e369238`)

- Replace standup trigger event requests (`1482b03`)

- Reorganize api contexts (`001e828`)

- Add all to new api (`2044888`)

- Remove nginx API proxy and configure direct backend URL (`798dec2`)

- Route internal API calls through kamal-proxy (`83ef961`)

- Replace accent-green with primary color across UI components (`21dc8f4`)

- Reorganize app directory structure into core, features, and shared (`2275f21`)

- Use file imports for avatar asset in auth callback (`ee9f120`)

- Make since period configurable for git log (`49bb412`)

- Extract route handlers into separate modular files (`fb03758`)

- Switch from Anthropic to Groq AI provider (`e3f3214`)

- Remove logger from bootstrap (`7b0c6e4`)

- Split internal routes into modular handlers and services (`9dac82d`)

- Reorganize monorepo files into context-based directories (`1054b71`)


### Security

- Fix 15 findings from security audit (TAS-31) (#28) (`187d23c`)


### Tests

- Add integration tests for StandupGeneratorService multi-provider fallback (TAS-30) (`5ab1369`)

- Add tests for null and undefined email inputs (`6747803`)

- Migrate api controller specs to http (`003a5de`)


### Build

- Fix libsql native addon path in Dockerfiles (`572dcc5`)

- Copy libsql native addon to Docker runtime images (`5577f05`)

- Add email package to db Docker build (`9c3f535`)

- Add email package to application Dockerfiles (`bad11ea`)

- Add email package to application Dockerfiles (`2f1aeb8`)

- Use custom build:prod script in Docker for better optimization (`306ca02`)

- Optimize Docker builds for production and reduce image size (`8829f28`)

- Add arm64 builder configuration (`0005c93`)

- Add multi-architecture Docker builds and improve service networking (`c980ac7`)

- Ignore scripts when installing web deps in Docker (`69d970e`)

- Add domain package to Docker build (`a8e9a67`)

- Add azure-devops package and tsconfig to Docker build (`baf5159`)

- Add tsconfig files to Docker build (`7e75f61`)

- Relocate migrate service Dockerfile to packages/db (`0c1d167`)

- Configure internal network and container naming for services (`c5291cf`)

- Compile apps to standalone binaries with minimal runtime images (`bf6d88f`)

- Add Docker infrastructure for monorepo services (`4822f24`)


### Improve

- Harden nginx config for production (#8) (`814d75f`)


### Merge

- Integrate standup cross-context communication redesign (`aa5a735`)


