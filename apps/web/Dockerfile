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
COPY packages/observability/package.json packages/observability/
COPY packages/standup-generator/package.json packages/standup-generator/

# Install dependencies scoped to @standup/web.
# --frozen-lockfile is incompatible with partial workspace installs.
# --ignore-scripts prevents optional native binaries (e.g. lmdb from @angular/build)
# from failing the install on linux/arm64 in CI — they are not needed for ng build.
RUN bun install --production --ignore-scripts --filter './apps/web'

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

# Copy nginx config as a template — ${DNS_RESOLVER} is replaced at startup
COPY apps/web/nginx.conf /etc/nginx/templates/default.conf.template

# Entrypoint: extracts DNS resolver from /etc/resolv.conf, substitutes only
# ${DNS_RESOLVER} in the nginx template (preserving nginx's own $variables),
# then starts nginx. Works on Docker (127.0.0.11) and Podman (aardvark-dns).
COPY apps/web/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80

CMD ["/docker-entrypoint.sh"]
