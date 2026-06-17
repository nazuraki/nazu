FROM node:24-alpine AS build
WORKDIR /app

RUN corepack enable pnpm

# Workspace manifests first for layer caching.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/discord/package.json apps/discord/

RUN pnpm install --frozen-lockfile

COPY apps/discord/ apps/discord/

RUN pnpm --filter @nazu/discord build

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM node:24-alpine AS runtime
WORKDIR /app

RUN corepack enable pnpm

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/discord/package.json apps/discord/

RUN pnpm install --prod --frozen-lockfile

COPY --from=build /app/apps/discord/dist apps/discord/dist

ENV NODE_ENV=production

WORKDIR /app/apps/discord
CMD ["node", "dist/index.js"]
