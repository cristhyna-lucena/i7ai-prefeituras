# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS base
WORKDIR /app
# Debian/glibc and optional npm binaries support Prisma and PDF parsing.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl libfontconfig1 fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
ENV CHECKPOINT_DISABLE=1 PRISMA_HIDE_UPDATE_MESSAGE=true

FROM base AS build
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --include=optional --no-audit --no-fund
COPY . .
RUN npm run prisma:generate && npm run build && npm prune --omit=dev --include=optional --no-audit --no-fund

FROM base AS runtime
ENV NODE_ENV=production PORT=3000
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/presets ./presets
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
