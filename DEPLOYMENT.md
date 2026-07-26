# Turbopay — Deployment Guide

This document covers local development, Docker deployment, Vercel deployment,
environment setup, database migration, security checklist, provider configuration,
and health monitoring.

---

## 1. Quick start (local development)

Prerequisites: [Bun](https://bun.sh) ≥ 1.3, Node.js ≥ 20.

```bash
# 1. Install dependencies
bun install

# 2. Configure environment
cp .env.example .env
# Edit .env — at minimum set JWT_SECRET, SESSION_SECRET, CRON_SECRET:
#   openssl rand -hex 32   # paste output into each secret

# 3. Create the SQLite database + apply schema
bun run db:push

# 4. (Optional) Generate Prisma client (also runs automatically via db:push)
bun run db:generate

# 5. Start the dev server (port 3000)
bun run dev
```

Open the preview panel (or `http://localhost:3000` locally) — the app loads the
landing page. Sign up via the auth screen; the first registered user becomes an
admin automatically.

---

## 2. Docker deployment (production-like)

The `docker-compose.yml` brings up three services:

| Service   | Image                | Port | Purpose                          |
| --------- | -------------------- | ---- | -------------------------------- |
| turbopay  | built from Dockerfile| 3000 | Next.js standalone (Bun runtime) |
| postgres  | postgres:16-alpine   | 5432 | Primary database (production)    |
| redis     | redis:7-alpine       | 6379 | Rate limiting / caching (optional)|

### Build & run

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env — set real secrets + Postgres credentials.

# 2. Build the app image + start all services
docker compose up -d --build

# 3. Tail logs
docker compose logs -f turbopay
```

### Database migration (PostgreSQL)

The committed `prisma/schema.prisma` uses `provider = "sqlite"` for local dev.
The docker-compose `turbopay` service overrides `DATABASE_URL` to point at the
postgres container. To create tables in postgres:

```bash
# Run prisma migrate against the running postgres container
docker compose exec turbopay bunx prisma migrate deploy \
  --schema prisma/schema.prisma

# OR, if you haven't created migration files yet:
docker compose exec turbopay bunx prisma db push --accept-data-loss
```

> **Note:** `prisma db push` is fine for initial bootstrap. For long-running
> production, use `prisma migrate dev` locally to generate migration files, then
> `prisma migrate deploy` in CI/CD.

### Health check

```bash
curl http://localhost:3000/api/health
# {"status":"ok","timestamp":"...","version":"0.2.1","uptime":42,"db":"connected"}
```

The Dockerfile defines a `HEALTHCHECK` that hits this endpoint every 30s.

### Stop / tear down

```bash
docker compose down            # stop containers, keep volumes
docker compose down -v         # stop + delete postgres/redis data
```

---

## 3. Vercel deployment

Turbopay is a standard Next.js 16 app — deploy to Vercel with one command.

```bash
# 1. Install Vercel CLI
npm i -g vercel

# 2. Deploy to production
vercel --prod
```

### Vercel project settings

- **Framework preset**: Next.js
- **Build command**: `bun run build` (or `next build` — Vercel auto-detects)
- **Output directory**: `.next` (auto-detected)
- **Install command**: `bun install`
- **Node version**: 20.x (or use Bun runtime)

### Environment variables

In the Vercel dashboard → Settings → Environment Variables, add every variable
from `.env.example` (at minimum: `DATABASE_URL`, `JWT_SECRET`, `SESSION_SECRET`,
`CRON_SECRET`, `NEXT_PUBLIC_APP_URL`).

> **Note:** Vercel does not support SQLite (ephemeral filesystem). Use a managed
> PostgreSQL (Vercel Postgres, Neon, Supabase, or Railway) and set
> `DATABASE_URL` to the connection string. Update `prisma/schema.prisma`
> `provider` to `"postgresql"` before deploying.

### Vercel Cron jobs

Turbopay has several `/api/cron/*` endpoints. Configure them in
`vercel.json` (or the Vercel dashboard → Cron Jobs) with the `CRON_SECRET`
header:

```json
{
  "crons": [
    { "path": "/api/cron/scheduled-payments?secret=CRON_SECRET", "schedule": "*/5 * * * *" },
    { "path": "/api/cron/interest-accrue?secret=CRON_SECRET", "schedule": "0 0 * * *" },
    { "path": "/api/cron/session-cleanup?secret=CRON_SECRET", "schedule": "0 * * * *" },
    { "path": "/api/cron/stuck-transactions?secret=CRON_SECRET", "schedule": "*/15 * * * *" },
    { "path": "/api/cron/outbox-publisher?secret=CRON_SECRET", "schedule": "*/2 * * * *" },
    { "path": "/api/cron/health-flush?secret=CRON_SECRET", "schedule": "*/1 * * * *" },
    { "path": "/api/cron/sanctions-fetch?secret=CRON_SECRET", "schedule": "0 2 * * 1" }
  ]
}
```

---

## 4. Environment setup

Copy the template and fill in secrets:

```bash
cp .env.example .env
```

### Generate secrets

```bash
# JWT signing secret
openssl rand -hex 32

# Session encryption secret
openssl rand -hex 32

# Cron endpoint protection
openssl rand -hex 32
```

Paste each output into `JWT_SECRET`, `SESSION_SECRET`, and `CRON_SECRET`.

### Key variables

| Variable              | Required | Description                                   |
| --------------------- | -------- | --------------------------------------------- |
| `DATABASE_URL`        | yes      | SQLite path (dev) or Postgres URL (prod)      |
| `JWT_SECRET`          | yes      | Signs JWTs — min 32 bytes of entropy          |
| `SESSION_SECRET`      | yes      | Encrypts session cookies — min 32 bytes       |
| `CRON_SECRET`         | yes      | Protects `/api/cron/*` endpoints              |
| `NEXT_PUBLIC_APP_URL` | yes      | Public URL (used for email links, CORS)       |
| `ALLOWED_ORIGINS`     | yes      | Comma-separated CORS allow-list               |
| `REDIS_URL`           | no       | Distributed rate limiting (falls back to RAM) |
| `SENTRY_DSN`          | no       | Error tracking                                |
| Payment provider keys | no       | App runs in mock/sandbox mode without them    |

---

## 5. Database migration (SQLite → PostgreSQL)

The schema is provider-agnostic — only the `provider` line + connection URL
differ between dev (SQLite) and prod (Postgres).

### Option A — Keep SQLite for dev, Postgres for prod (recommended)

1. Locally, develop against SQLite (`DATABASE_URL="file:./db/custom.db"`).
2. For production, set `DATABASE_URL="postgresql://..."` in your hosting env.
3. Maintain a prod-only schema override, OR swap the provider at deploy time:

```bash
# In CI/CD, before prisma migrate deploy:
sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma
bunx prisma migrate deploy
```

### Option B — Switch to Postgres everywhere

1. Edit `prisma/schema.prisma`: change `provider = "sqlite"` → `"postgresql"`.
2. Update `DATABASE_URL` in `.env` to a Postgres connection string.
3. Create + apply migrations:
   ```bash
   bunx prisma migrate dev --name init
   ```
4. Commit the generated `prisma/migrations/` folder.

> **Note:** Some SQLite-specific behaviors (e.g. `DateTime` storage, no native
> enums) are handled in the schema via `String` + app-level constants, so the
> migration is mostly mechanical.

---

## 6. Security checklist

Before going live, verify each item:

- [ ] **`JWT_SECRET`** — set, ≥ 32 bytes, not committed to git.
- [ ] **`SESSION_SECRET`** — set, ≥ 32 bytes, not committed to git.
- [ ] **`CRON_SECRET`** — set, used in all cron job invocations.
- [ ] **`NEXT_PUBLIC_APP_URL`** — matches your production domain exactly
      (including protocol; no trailing slash).
- [ ] **`ALLOWED_ORIGINS`** — restricted to your real frontend domains.
      Never `*` in production.
- [ ] **HTTPS everywhere** — Caddy auto-provisions Let's Encrypt certs (see
      `Caddyfile.prod`). Vercel does this automatically.
- [ ] **Provider API keys** — stored encrypted in DB via Admin Console →
      Providers → Rotate Credentials. Do NOT put live keys in `.env` for
      production; use the admin UI so they're encrypted at rest.
- [ ] **`NODE_ENV=production`** — ensures Next.js optimizations + Prisma
      error-only logging.
- [ ] **Rate limiting** — set `REDIS_URL` in production so rate limits are
      shared across instances (in-memory fallback is per-process).
- [ ] **Sentry** — set `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` for error
      monitoring. Configure source maps via `SENTRY_AUTH_TOKEN`.
- [ ] **WebAuthn RP ID** — set `WEBAUTHN_RP_ID` to your production domain
      (e.g. `turbopay.example.com`) for passkey authentication.
- [ ] **Admin access** — the first registered user becomes admin. Restrict
      sign-up after bootstrap, or seed the admin via a migration.
- [ ] **Backups** — schedule Postgres backups (e.g. `pg_dump` cron or managed
      snapshots).
- [ ] **Cron protection** — verify `/api/cron/*` returns 401 without the
      `x-cron-secret` header (or `?secret=` query param).

---

## 7. Payment provider setup

Turbopay integrates with 18+ payment providers (Paystack, Flutterwave, Monnify,
M-Pesa, MTN MoMo, Airtel Money, Smartcash, Paga, Baxi, Remita, Quickteller,
Stripe, Wise, etc.). The app runs in **sandbox/mock mode** when no provider keys
are configured — all transactions are simulated.

### Configure live providers

1. Sign in as an admin.
2. Open **Admin Console → Providers** tab.
3. For each provider you want to enable:
   - Toggle **Enabled** on.
   - Click **Rotate Credentials**.
   - Paste your API key / secret / contract code.
   - Choose **Sandbox** or **Live** mode.
   - Save. Credentials are encrypted at rest in the `ProviderConfig` table.

### Routing

The **Admin Console → Routing** tab lets you configure per-capability routing
(fallback chains, weight-based load balancing, circuit breaker thresholds).
Provider health is sampled continuously and visualized in the
**Provider Health** widget.

### Webhooks

Each provider sends transaction webhooks to:
```
POST /api/webhooks/turbocore/{provider}
```
Configure this URL in each provider's dashboard. Webhook signatures are verified
using the provider's configured secret (see `src/lib/turbocore/webhooks/`).

---

## 8. Health monitoring

### Public health endpoint

```bash
GET /api/health
```

Response (200):
```json
{
  "status": "ok",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "version": "0.2.1",
  "uptime": 3600,
  "db": "connected"
}
```

Response (503 — DB unreachable):
```json
{
  "status": "error",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "version": "0.2.1",
  "uptime": 3600,
  "db": "error"
}
```

### Admin provider health

```bash
GET /api/admin/health
```

Requires admin session. Returns per-provider circuit breaker state, health
score, success rate, and the last 10 health-check samples.

### Docker healthcheck

The Dockerfile defines:
```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1
```

Check container health:
```bash
docker inspect --format='{{.State.Health.Status}}' turbopay-app
# healthy | unhealthy | starting
```

### Uptime monitoring

Point your external monitor (Pingdom, Better Stack, UptimeRobot) at:
```
https://your-domain.com/api/health
```
Expect HTTP 200 with `"status":"ok"`. Alert on non-200 or `"db":"error"`.

---

## 9. Production reverse proxy (Caddy)

The repo includes `Caddyfile.prod` for production TLS termination + reverse
proxy. (The repo's `Caddyfile` is the sandbox/dev gateway config — do not
overwrite it.)

### Run Caddy standalone

```bash
# Set your domain
export DOMAIN=turbopay.example.com

# Run Caddy with the production config
caddy run --config Caddyfile.prod
```

Caddy automatically:
- Provisions a Let's Encrypt TLS certificate.
- Reverse-proxies to `turbopay:3000` (the docker-compose service name).
- Adds security headers (HSTS, X-Frame-Options, etc.).
- Gzip-compresses responses.
- Long-caches Next.js static assets.

### Add Caddy to docker-compose (optional)

Append a `caddy` service to `docker-compose.yml`:

```yaml
  caddy:
    image: caddy:2-alpine
    container_name: turbopay-caddy
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile.prod:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    environment:
      - DOMAIN=${DOMAIN}
    depends_on:
      - turbopay
    restart: unless-stopped
    networks:
      - default

volumes:
  caddy_data:
  caddy_config:
```

---

## 10. Troubleshooting

### Container won't start

```bash
docker compose logs turbopay
```
Common causes:
- `DATABASE_URL` points to unreachable host (check `depends_on: postgres`).
- Prisma client not generated — ensure `bun run db:generate` runs in build
  (it does, via the Dockerfile).
- Port 3000 already in use on host — change the port mapping.

### DB connection errors

```bash
# Verify postgres is up
docker compose exec postgres pg_isready -U turbopay

# Connect to postgres
docker compose exec postgres psql -U turbopay -d turbopay

# Check tables exist
\dt
```

If tables are missing, run the migration (see §5).

### Healthcheck fails

```bash
# Hit the endpoint directly
docker compose exec turbopay wget -qO- http://localhost:3000/api/health

# If db: "error", check DATABASE_URL + postgres health
```

### Prisma engine issues on Alpine

The Dockerfile installs `openssl` (needed by Prisma's musl query engine). If
you see `Query engine library not found` errors, verify:

```bash
docker compose exec turbopay ls node_modules/.prisma/client/
# Should show libquery_engine-linux-musl-*.so.node
```

If missing, the build stage's `bun run db:generate` failed — check build logs.
