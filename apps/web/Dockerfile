FROM node:24-alpine AS build
WORKDIR /app

RUN corepack enable pnpm

# Copy workspace manifests first for layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/ui/package.json packages/ui/

RUN pnpm install --frozen-lockfile

COPY apps/web/ apps/web/
COPY packages/ui/ packages/ui/

RUN pnpm --filter @nazu/web build

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM node:24-alpine AS runtime
WORKDIR /app

# Docker CLI + compose plugin: the web app shells out to `docker compose` over
# the mounted socket to toggle optional services from the config UI. Client
# only — it talks to the host daemon, no daemon runs in this container.
RUN apk add --no-cache docker-cli docker-cli-compose

RUN corepack enable pnpm

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/ui/ packages/ui/

RUN pnpm install --prod --frozen-lockfile

COPY --from=build /app/apps/web/build apps/web/build
COPY infra/postgres/migrations /app/migrations

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV MIGRATIONS_DIR=/app/migrations

WORKDIR /app/apps/web
EXPOSE 3000

CMD ["node", "build"]
