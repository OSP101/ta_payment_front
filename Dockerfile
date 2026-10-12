# syntax=docker/dockerfile:1.7
#
# Built by deploy/docker-compose.yml with context = this directory.
# Three stages: install deps -> `next build` (standalone) -> tiny runtime.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_OUTPUT_STANDALONE=1 \
    BROWSER_SOURCEMAPS=1
# Baked into next.config.ts's rewrites() at build time; compose passes the
# same value at runtime for the server-side fetches in app/lib.
ARG API_URL=http://backend:8080
ENV API_URL=$API_URL
RUN npm run build
# Source maps for error reports (GlitchTip). `inject` stamps a debug id into
# every browser bundle and its map, which is how GlitchTip pairs a crashed
# file with its map regardless of release names. The stamped bundles + maps
# are kept in /sourcemaps for the `sourcemaps` stage below to upload, and the
# maps are then removed from .next/static: the runtime image never serves them.
RUN npx sentry-cli sourcemaps inject .next/static \
 && mkdir -p /sourcemaps \
 && cp -R .next/static /sourcemaps/static \
 && find .next/static -name '*.map' -delete

# Not part of the app image. deploy/scripts/deploy.sh builds this stage (from
# the same cache) and runs it once per deploy to upload the maps to GlitchTip.
FROM node:22-alpine AS sourcemaps
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /sourcemaps /sourcemaps
ENTRYPOINT ["npx", "sentry-cli"]
CMD ["sourcemaps", "upload", "/sourcemaps"]

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
RUN apk add --no-cache tzdata \
 && addgroup -S -g 1001 nodejs \
 && adduser -S -u 1001 -G nodejs nextjs
# Standalone output = server.js + the subset of node_modules it needs.
# public/ and .next/static are NOT included by next and must be copied next
# to it at the same relative paths.
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/ || exit 1
CMD ["node", "server.js"]
