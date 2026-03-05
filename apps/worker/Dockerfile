# Stage 1: install dependencies
FROM oven/bun:1.3.9 AS install
WORKDIR /app

# Copy workspace manifests first for layer caching
COPY package.json bun.lock turbo.json biome.json tsconfig.base.json ./

# App manifest
COPY apps/worker/package.json apps/worker/tsconfig.json apps/worker/

# Package manifests (only what worker depends on)
COPY packages/config/package.json packages/config/tsconfig.json packages/config/
COPY packages/db/package.json packages/db/tsconfig.json packages/db/
COPY packages/domain/package.json packages/domain/tsconfig.json packages/domain/
COPY packages/git-collector/package.json packages/git-collector/tsconfig.json packages/git-collector/
COPY packages/logger/package.json packages/logger/tsconfig.json packages/logger/
COPY packages/standup-generator/package.json packages/standup-generator/tsconfig.json packages/standup-generator/

RUN bun install --frozen-lockfile

# Stage 2: runtime
# worker needs git for git-collector (shells out to git binary)
FROM oven/bun:1.3.9 AS runtime
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

# Copy installed node_modules from install stage
COPY --from=install /app/node_modules ./node_modules

# Copy source for all required packages and the app
COPY packages/config/src packages/config/src
COPY packages/db/src packages/db/src
COPY packages/domain/src packages/domain/src
COPY packages/git-collector/src packages/git-collector/src
COPY packages/logger/src packages/logger/src
COPY packages/standup-generator/src packages/standup-generator/src
COPY apps/worker/src apps/worker/src

# Copy workspace manifests needed at runtime for module resolution
COPY package.json bun.lock ./
COPY apps/worker/package.json apps/worker/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/domain/package.json packages/domain/
COPY packages/git-collector/package.json packages/git-collector/
COPY packages/logger/package.json packages/logger/
COPY packages/standup-generator/package.json packages/standup-generator/

EXPOSE 3335

CMD ["bun", "apps/worker/src/index.ts"]
