# Stage 1: install dependencies
FROM oven/bun:1.3.9 AS install
WORKDIR /app

# Copy workspace manifests first for layer caching
COPY package.json bun.lock turbo.json biome.json tsconfig.base.json ./

# App manifest
COPY apps/discord-bot/package.json apps/discord-bot/tsconfig.json apps/discord-bot/

# Package manifests (only what discord-bot depends on)
COPY packages/config/package.json packages/config/tsconfig.json packages/config/
COPY packages/db/package.json packages/db/tsconfig.json packages/db/
COPY packages/domain/package.json packages/domain/tsconfig.json packages/domain/
COPY packages/logger/package.json packages/logger/tsconfig.json packages/logger/

RUN bun install --frozen-lockfile

# Stage 2: runtime
FROM oven/bun:1.3.9 AS runtime
WORKDIR /app

# Copy installed node_modules from install stage
COPY --from=install /app/node_modules ./node_modules

# Copy source for all required packages and the app
COPY packages/config/src packages/config/src
COPY packages/db/src packages/db/src
COPY packages/domain/src packages/domain/src
COPY packages/logger/src packages/logger/src
COPY apps/discord-bot/src apps/discord-bot/src

# Copy workspace manifests needed at runtime for module resolution
COPY package.json bun.lock ./
COPY apps/discord-bot/package.json apps/discord-bot/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/domain/package.json packages/domain/
COPY packages/logger/package.json packages/logger/

EXPOSE 3334

CMD ["bun", "apps/discord-bot/src/index.ts"]
