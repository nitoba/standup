# Dockerfile.migrate — runs Drizzle migrations once before apps start.
# Stays on oven/bun because migrate.ts reads SQL files via import.meta.url at runtime.

FROM oven/bun:1.3.9
WORKDIR /app

# Root manifest + lockfile
COPY package.json bun.lock ./

# Only the manifests needed by the migrate script and its workspace deps
COPY packages/db/package.json packages/db/
COPY packages/config/package.json packages/config/
COPY packages/domain/package.json packages/domain/
COPY packages/logger/package.json packages/logger/

# --filter installs only the db package and its dependencies
RUN bun install --filter './packages/db'

# Copy source for all required packages
COPY packages/config/src packages/config/src
COPY packages/db/src packages/db/src
COPY packages/domain/src packages/domain/src
COPY packages/logger/src packages/logger/src

CMD ["bun", "packages/db/src/migrate.ts"]
