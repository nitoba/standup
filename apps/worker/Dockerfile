# Stage 1: install + compile — produces a single standalone binary
FROM oven/bun:1.3.9 AS builder
WORKDIR /app

# Root manifest + lockfile — lockfile is used as resolution baseline even without --frozen-lockfile
COPY package.json bun.lock ./

# Only the manifests needed by this app and its workspace deps.
COPY apps/worker/package.json apps/worker/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/domain/package.json packages/domain/
COPY packages/git-collector/package.json packages/git-collector/
COPY packages/logger/package.json packages/logger/
COPY packages/standup-generator/package.json packages/standup-generator/

# --filter restricts installation to @standup/worker and its workspace dependencies.
# The bun.lock still pins all versions for reproducible builds.
RUN bun install --filter './apps/worker'

# Copy source for the app and all packages it imports
COPY packages/config/src packages/config/src
COPY packages/db/src packages/db/src
COPY packages/domain/src packages/domain/src
COPY packages/git-collector/src packages/git-collector/src
COPY packages/logger/src packages/logger/src
COPY packages/standup-generator/src packages/standup-generator/src
COPY apps/worker/src apps/worker/src

RUN bun build \
  --compile \
  --minify \
  --sourcemap \
  --bytecode \
  --target=bun-linux-x64-musl \
  --no-compile-autoload-dotenv \
  apps/worker/src/index.ts \
  --outfile /app/bin/worker

# Stage 2: minimal runtime — Alpine + git.
# musl target is required for Alpine compatibility (Alpine uses musl libc, not glibc).
# libstdc++ is needed by the Bun runtime embedded in the binary.
# Alpine + git + libstdc++ + ca-certificates is ~40 MB vs debian-slim + git ~112 MB.
FROM alpine:3.21 AS runtime

RUN apk add --no-cache git libstdc++ ca-certificates

WORKDIR /app

COPY --from=builder /app/bin/worker ./worker

EXPOSE 3335

CMD ["/app/worker"]
