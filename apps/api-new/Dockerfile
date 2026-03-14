# Stage 1: install runtime dependencies for the monolith
FROM oven/bun:1.3.10 AS builder
WORKDIR /app

COPY package.json bun.lock ./
COPY tsconfig.base.json ./

COPY apps/api-new/package.json apps/api-new/
COPY apps/api-new/tsconfig.json apps/api-new/
COPY apps/api-new/tsconfig.build.json apps/api-new/
COPY apps/api-new/nest-cli.json apps/api-new/
COPY apps/web/package.json apps/web/
COPY packages/config/package.json packages/config/
COPY packages/domain/package.json packages/domain/

RUN bun install --production --filter './apps/api-new'

COPY packages/domain/src packages/domain/src
COPY apps/api-new/src apps/api-new/src
COPY apps/api-new/drizzle.config.ts apps/api-new/drizzle.config.ts

# Stage 2: runtime
FROM oven/bun:1.3.10 AS runtime
WORKDIR /app

COPY --from=builder /app /app

WORKDIR /app/apps/api-new

EXPOSE 3333

CMD ["bun", "src/main.ts"]
