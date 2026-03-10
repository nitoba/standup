# Stage 1: install + build — produces static assets in dist/web/browser
FROM oven/bun:1.3.9 AS builder
WORKDIR /app

# Root manifest + lockfile
COPY package.json bun.lock ./
COPY tsconfig.base.json ./

# All workspace member manifests so bun can resolve the full workspace graph.
# --filter only installs deps for the target app, but bun still needs every
# workspace member's package.json to reconcile the lockfile.
COPY apps/api/package.json apps/api/
COPY apps/discord-bot/package.json apps/discord-bot/
COPY apps/web/package.json apps/web/
COPY apps/web/tsconfig.json apps/web/
COPY apps/web/tsconfig.app.json apps/web/
COPY apps/web/angular.json apps/web/
COPY apps/web/.postcssrc.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/azure-devops/package.json packages/azure-devops/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/domain/package.json packages/domain/
COPY packages/git-collector/package.json packages/git-collector/
COPY packages/logger/package.json packages/logger/
COPY packages/standup-generator/package.json packages/standup-generator/

# Strip root devDependencies (turbo, biome, drizzle-kit etc.) — CI-only tools
# that include platform-specific binaries and are not needed for the app build.
RUN sed -i '/"devDependencies"/,/}/d' package.json

# Install dependencies scoped to @standup/web.
# --frozen-lockfile is incompatible with partial workspace installs.
RUN bun install --filter './apps/web'

# Copy source for the app
COPY apps/web/src apps/web/src
COPY apps/web/public apps/web/public

# Build the Angular app in production mode.
# bunx resolves the Angular CLI from node_modules.
RUN cd apps/web && bunx ng build --configuration production

# Stage 2: minimal nginx runtime — only the static assets + config.
# Using nginx:alpine for the smallest possible image (~40 MB).
FROM nginx:1-alpine AS runtime

# Remove default nginx site
RUN rm -rf /usr/share/nginx/html/*

# Copy the Angular build output
COPY --from=builder /app/apps/web/dist/web/browser /usr/share/nginx/html

# Copy custom nginx config
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# nginx runs in foreground (required for Docker)
CMD ["nginx", "-g", "daemon off;"]
