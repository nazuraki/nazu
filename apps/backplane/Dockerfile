FROM node:24-alpine AS build
WORKDIR /app

RUN corepack enable pnpm

# Workspace manifests first for layer caching.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/backplane/package.json apps/backplane/

RUN pnpm install --frozen-lockfile

COPY apps/backplane/ apps/backplane/

RUN pnpm --filter @nazu/backplane build

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM node:24-alpine AS runtime
WORKDIR /app

# The backplane drives target stacks from outside: git syncs their repos and
# runs `docker compose` against the host daemon via the mounted socket. Client
# tools only — no daemon runs in this container.
RUN apk add --no-cache docker-cli docker-cli-compose git
# Workdirs are a host bind mount, so checkouts may be seeded or edited from the
# host under another uid; without this git refuses them ("dubious ownership").
# safe.directory is only honoured from system/global config, not `-c`.
RUN git config --system --add safe.directory '*'

RUN corepack enable pnpm

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/backplane/package.json apps/backplane/

RUN pnpm install --prod --frozen-lockfile

COPY --from=build /app/apps/backplane/dist apps/backplane/dist

ENV NODE_ENV=production
ENV PORT=8430
ENV BACKPLANE_DATA_DIR=/data

WORKDIR /app/apps/backplane
EXPOSE 8430

CMD ["node", "dist/server/index.js"]
