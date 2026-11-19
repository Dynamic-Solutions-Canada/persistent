# Production image: builds the shared package, the web PWA, and the API, then
# runs a single Node process that serves both the API and the built web app
# (same origin) and applies Prisma migrations on startup.
#
# Build context is the repo root. Used by compose.server.yml.

# --- build stage ---
FROM node:24.22.3-bookworm-slim AS build
WORKDIR /app
# OpenSSL so Prisma's install fetches the schema engine (used by `prisma migrate deploy`)
# for debian-openssl-3.0.x, matching the runtime image.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*

# Install deps first (better layer caching). Copy the lockfile + every workspace
# manifest, then `npm ci` so the workspace symlinks resolve.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci

COPY . .
# Generate the Prisma client, then build shared -> web -> api.
RUN npm run db:generate \
 && npm run build --workspace @persistent/shared \
 && npm run build --workspace @persistent/web \
 && npm run build --workspace @persistent/api

# --- runtime stage ---
FROM node:24.22.3-bookworm-slim AS runtime
WORKDIR /app
# Prisma's schema engine needs OpenSSL when migrations run at startup.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV API_PORT=4000
ENV WEB_DIST_DIR=/app/apps/web/dist

# Copy the built workspace (the API's dist carries the generated Prisma client,
# node_modules the @persistent/shared workspace symlink and the prisma CLI for
# migrations).
# The copied files are owned by the image's unprivileged `node` user (SEC-7) and
# the app runs as that user, never root. /app itself stays root-owned. The API
# keeps no data in the container (Postgres holds it), so nothing needs to write
# to /app at runtime; the ownership only means a stray Prisma engine or cache
# write under node_modules would not fail.
COPY --from=build --chown=node:node /app .

USER node
EXPOSE 4000
# Which commit and release this image is (CTR-1); the deploy passes both as build args. Declared
# last so a new revision does not invalidate the cached layers above.
ARG REVISION=unknown
ARG VERSION=unknown
LABEL org.opencontainers.image.revision=$REVISION org.opencontainers.image.version=$VERSION
CMD ["npm", "run", "start:prod"]
