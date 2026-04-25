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

COPY --from=build /app/apps/web/build ./build
COPY --from=build /app/apps/web/package.json ./package.json

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

EXPOSE 3000

CMD ["node", "build"]
