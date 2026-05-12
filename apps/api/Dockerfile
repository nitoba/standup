# Stage 1: install dependencies and compile the monolith into a standalone binary
FROM oven/bun:1.3.10 AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 \
  make \
  g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
COPY tsconfig.base.json ./

COPY apps/api/package.json apps/api/
COPY apps/api/tsconfig.json apps/api/
COPY apps/api/tsconfig.build.json apps/api/
COPY apps/api/nest-cli.json apps/api/
COPY apps/web/package.json apps/web/

RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --ignore-scripts --production --filter './apps/api'

COPY apps/api/src apps/api/src
COPY apps/api/drizzle.config.ts apps/api/drizzle.config.ts
COPY apps/api/docker-entrypoint.sh apps/api/docker-entrypoint.sh

ARG TARGETARCH
RUN set -eux; \
  BUN_TARGET_ARCH="$([ "${TARGETARCH:-}" = "amd64" ] && echo "x64" || echo "${TARGETARCH:-arm64}")"; \
  bun build \
    --compile \
    --minify \
    --sourcemap \
    --bytecode \
    --target="bun-linux-${BUN_TARGET_ARCH}" \
    --no-compile-autoload-dotenv \
    --external @nestjs/graphql \
    --external @nestjs/graphql/* \
    --external @nestjs/apollo \
    --external @nestjs/apollo/* \
    --external @nestjs/microservices \
    --external @nestjs/microservices/* \
    --external @nestjs/websockets \
    --external @nestjs/websockets/* \
    --external @apollo/subgraph \
    --external @apollo/subgraph/* \
    --external ts-morph \
    --external class-transformer/storage \
    apps/api/src/main.ts \
    --outfile /app/bin/api

# Stage 2: runtime image with Bun CLI, git/ssh tooling and the compiled binary
FROM debian:bookworm-slim AS runtime
LABEL service="standup-api"
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
  git \
  ca-certificates \
  openssh-client \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/local/bin/bun /usr/local/bin/bun
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/apps/api/package.json /app/apps/api/package.json
COPY --from=builder /app/apps/api/node_modules /app/apps/api/node_modules
# Keep only the runtime-read source assets: DB migrations, migrator imports,
# and LLM prompt files loaded from disk by the compiled binary.
COPY --from=builder /app/apps/api/src/platform/database/migrate.ts /app/apps/api/src/platform/database/migrate.ts
COPY --from=builder /app/apps/api/src/platform/database/migrations /app/apps/api/src/platform/database/migrations
COPY --from=builder /app/apps/api/src/platform/logger /app/apps/api/src/platform/logger
COPY --from=builder /app/apps/api/src/contexts/standups/worker/standup-generator/prompts /app/apps/api/src/contexts/standups/worker/standup-generator/prompts
COPY --from=builder /app/apps/api/docker-entrypoint.sh /usr/local/bin/start-api
COPY --from=builder /app/bin/api /app/bin/api

ARG TARGETARCH
RUN set -eux; \
  LIBSQL_TARGET="$([ "${TARGETARCH:-}" = "amd64" ] && echo "linux-x64-gnu" || echo "linux-${TARGETARCH:-arm64}-gnu")"; \
  mkdir -p /app/node_modules/@libsql; \
  cp -RL "/app/node_modules/.bun/node_modules/@libsql/${LIBSQL_TARGET}" "/app/node_modules/@libsql/${LIBSQL_TARGET}"; \
  chmod +x /usr/local/bin/start-api /app/bin/api; \
  # Create empty stubs for --external NestJS optional deps resolved at runtime
  for pkg in @nestjs/graphql @nestjs/apollo @nestjs/microservices @nestjs/websockets @apollo/subgraph ts-morph; do \
    mkdir -p "/app/node_modules/${pkg}"; \
    echo '{"name":"'"${pkg}"'","version":"0.0.0","main":"index.js"}' > "/app/node_modules/${pkg}/package.json"; \
    echo 'module.exports = {};' > "/app/node_modules/${pkg}/index.js"; \
  done; \
  rm -f /app/apps/api/src/platform/database/migrations/*.spec.ts; \
  mkdir -p /app/node_modules/class-transformer; \
  echo 'module.exports = {};' > /app/node_modules/class-transformer/storage.js

EXPOSE 3333

ENTRYPOINT ["/usr/local/bin/start-api"]
CMD ["/app/bin/api"]
