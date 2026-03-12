# Stage 1: install + compile — produces a single standalone binary
FROM oven/bun:1.3.9 AS builder
WORKDIR /app

# Root manifest + lockfile — lockfile is used as resolution baseline even without --frozen-lockfile
COPY package.json bun.lock ./

# All workspace member manifests so bun can resolve the full workspace graph.
# --filter only installs deps for the target app, but bun still needs every
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
COPY packages/standup-generator/package.json packages/standup-generator/
COPY packages/email/package.json packages/email/

# --filter restricts installation to @standup/discord-bot and its workspace dependencies.
# The bun.lock still pins all versions for reproducible builds.
RUN bun install --production --filter './apps/discord-bot'

# Copy source for the app and all packages it imports
COPY packages/config/src packages/config/src
COPY packages/db/src packages/db/src
COPY packages/domain/src packages/domain/src
COPY packages/logger/src packages/logger/src
COPY packages/observability/src packages/observability/src
COPY apps/discord-bot/src apps/discord-bot/src

# TARGETARCH is injected by Docker (amd64, arm64, etc.)
ARG TARGETARCH
RUN bun build \
  --compile \
  --minify \
  --sourcemap \
  --bytecode \
  --target=bun-linux-$([ "$TARGETARCH" = "amd64" ] && echo "x64" || echo "$TARGETARCH") \
  --no-compile-autoload-dotenv \
  apps/discord-bot/src/index.ts \
  --outfile /app/bin/discord-bot

# Stage 2: minimal runtime — only the compiled binary.
# distroless/cc provides glibc + libstdc++ only (~24 MB vs debian-slim's 75 MB).
# The Bun standalone binary only needs glibc to run.
FROM gcr.io/distroless/cc-debian12 AS runtime

WORKDIR /app

COPY --from=builder /app/bin/discord-bot ./discord-bot
# @libsql/client loads its native addon dynamically (NAPI-RS pattern), so bun --compile
# cannot embed it. Bun places optionalDependencies of workspace packages inside the
# workspace package's own node_modules. The compiled binary resolves native modules
# relative to its own path (/app/discord-bot → /app/node_modules/).
COPY --from=builder /app/packages/db/node_modules/@libsql/linux-arm64-gnu ./node_modules/@libsql/linux-arm64-gnu

EXPOSE 3334

CMD ["/app/discord-bot"]
