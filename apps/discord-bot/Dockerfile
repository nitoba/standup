# Stage 1: install + compile — produces a single standalone binary
FROM oven/bun:1.3.9 AS builder
WORKDIR /app

# Root manifest + lockfile — lockfile is used as resolution baseline even without --frozen-lockfile
COPY package.json bun.lock ./

# Only the manifests needed by this app and its workspace deps.
COPY apps/discord-bot/package.json apps/discord-bot/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/domain/package.json packages/domain/
COPY packages/logger/package.json packages/logger/

# --filter restricts installation to @standup/discord-bot and its workspace dependencies.
# The bun.lock still pins all versions for reproducible builds.
RUN bun install --filter './apps/discord-bot'

# Copy source for the app and all packages it imports
COPY packages/config/src packages/config/src
COPY packages/db/src packages/db/src
COPY packages/domain/src packages/domain/src
COPY packages/logger/src packages/logger/src
COPY apps/discord-bot/src apps/discord-bot/src

RUN bun build \
  --compile \
  --minify \
  --sourcemap \
  --bytecode \
  --target=bun-linux-x64 \
  --no-compile-autoload-dotenv \
  apps/discord-bot/src/index.ts \
  --outfile /app/bin/discord-bot

# Stage 2: minimal runtime — only the compiled binary.
# distroless/cc provides glibc + libstdc++ only (~24 MB vs debian-slim's 75 MB).
# The Bun standalone binary only needs glibc to run.
FROM gcr.io/distroless/cc-debian12 AS runtime

WORKDIR /app

COPY --from=builder /app/bin/discord-bot ./discord-bot

EXPOSE 3334

CMD ["/app/discord-bot"]
