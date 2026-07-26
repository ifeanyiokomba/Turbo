# =============================================================================
# Turbopay — Multi-stage Dockerfile (Bun runtime)
# Target image size: ~150MB (Alpine + Next.js standalone)
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: deps — install dependencies (cached layer)
# -----------------------------------------------------------------------------
FROM oven/bun:1.3-alpine AS deps
WORKDIR /app

# Install openssl (needed by Prisma engine on Alpine musl)
RUN apk add --no-cache openssl

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# -----------------------------------------------------------------------------
# Stage 2: builder — compile Next.js standalone + generate Prisma client
# -----------------------------------------------------------------------------
FROM oven/bun:1.3-alpine AS builder
WORKDIR /app

RUN apk add --no-cache openssl

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Generate Prisma client (engines for musl/Alpine) before building Next.js
RUN bun run db:generate

# Build Next.js (output: "standalone") + copy static + public into standalone
# (see package.json "build" script)
RUN bun run build

# -----------------------------------------------------------------------------
# Stage 3: runner — minimal image with only runtime artifacts
# -----------------------------------------------------------------------------
FROM oven/bun:1.3-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# openssl needed at runtime by Prisma query engine on Alpine
RUN apk add --no-cache openssl wget && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy public assets (Next.js standalone already includes them, but be explicit)
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Copy the standalone server bundle (contains server.js, minimal node_modules, package.json)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# Copy static assets (already in standalone via build script, but explicit for safety)
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy Prisma schema (needed by client at runtime for datasource resolution)
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Copy generated Prisma client + engines (not traced by Next.js standalone)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["bun", "server.js"]
