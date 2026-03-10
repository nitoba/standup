# Stage 1: install + compile — produces a single standalone binary
FROM oven/bun:1.3.9 AS builder
WORKDIR /app

# Root manifest + lockfile — lockfile is used as resolution baseline even without --frozen-lockfile
COPY package.json bun.lock ./
COPY tsconfig.base.json ./

# All workspace member manifests so bun can resolve the full workspace graph.
# --filter only installs deps for the target app, but bun still needs every
# workspace member's package.json to reconcile the lockfile.
COPY apps/api/package.json apps/api/
COPY apps/discord-bot/package.json apps/discord-bot/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY apps/worker/tsconfig.json apps/worker/
COPY packages/azure-devops/package.json packages/azure-devops/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/domain/package.json packages/domain/
COPY packages/git-collector/package.json packages/git-collector/
COPY packages/logger/package.json packages/logger/
COPY packages/observability/package.json packages/observability/
COPY packages/standup-generator/package.json packages/standup-generator/

# --filter restricts installation to @standup/worker and its workspace dependencies.
# The bun.lock still pins all versions for reproducible builds.
RUN bun install --filter './apps/worker'

# Copy source for the app and all packages it imports
COPY packages/config/src packages/config/src
COPY packages/db/src packages/db/src
COPY packages/domain/src packages/domain/src
COPY packages/azure-devops/src packages/azure-devops/src
COPY packages/git-collector/src packages/git-collector/src
COPY packages/logger/src packages/logger/src
COPY packages/observability/src packages/observability/src
COPY packages/standup-generator/src packages/standup-generator/src
COPY apps/worker/src apps/worker/src

# TARGETARCH is injected by Docker (amd64, arm64, etc.)
ARG TARGETARCH
RUN bun build \
  --compile \
  --minify \
  --sourcemap \
  --bytecode \
  --target=bun-linux-$([ "$TARGETARCH" = "amd64" ] && echo "x64" || echo "$TARGETARCH") \
  --no-compile-autoload-dotenv \
  apps/worker/src/index.ts \
  --outfile /app/bin/worker

# Stage 2: runtime — oven/bun image (includes bunx for Azure MCP server) + git.
# The worker spawns `bunx @tiberriver256/mcp-server-azure-devops` as a subprocess
# for Azure DevOps enrichment, so the Bun runtime must be present at runtime.
# oven/bun is based on debian and includes glibc, so the compiled binary runs fine.
FROM oven/bun:1.3.9 AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
  git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/bin/worker ./worker

EXPOSE 3335

CMD ["/app/worker"]
