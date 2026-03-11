# Dockerfile.migrate — runs Drizzle migrations once before apps start.
# Stays on oven/bun because migrate.ts reads SQL files via import.meta.url at runtime.

FROM oven/bun:1.3.9
WORKDIR /app

# Root manifest + lockfile
COPY package.json bun.lock ./

# All workspace member manifests so bun can resolve the full workspace graph.
# --filter only installs deps for the target package, but bun still needs every
# workspace member's package.json to reconcile the lockfile.
COPY apps/api/package.json apps/api/
COPY apps/discord-bot/package.json apps/discord-bot/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/azure-devops/package.json packages/azure-devops/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/domain/package.json packages/domain/
COPY packages/git-collector/package.json packages/git-collector/
COPY packages/logger/package.json packages/logger/
COPY packages/observability/package.json packages/observability/
COPY packages/email/package.json packages/email/
COPY packages/standup-generator/package.json packages/standup-generator/

# --filter installs only the db package and its dependencies
RUN bun install --filter './packages/db'

# Copy source for all required packages
COPY packages/config/src packages/config/src
COPY packages/db/src packages/db/src
COPY packages/domain/src packages/domain/src
COPY packages/logger/src packages/logger/src

CMD ["bun", "packages/db/src/migrate.ts"]
