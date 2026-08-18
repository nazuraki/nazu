FROM node:24-alpine AS build
WORKDIR /app

RUN corepack enable pnpm

# Workspace manifests first for layer caching.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/usr/package.json apps/usr/

RUN pnpm install --frozen-lockfile

COPY apps/usr/ apps/usr/

RUN pnpm --filter @nazu/usr build

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM node:24-alpine AS runtime
WORKDIR /app

RUN corepack enable pnpm

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/usr/package.json apps/usr/

RUN pnpm install --prod --frozen-lockfile

COPY --from=build /app/apps/usr/dist apps/usr/dist
COPY apps/usr/migrations apps/usr/migrations

ENV NODE_ENV=production
ENV PORT=8432

WORKDIR /app/apps/usr
EXPOSE 8432

CMD ["node", "dist/server/index.js"]
