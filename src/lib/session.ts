// Turbopay session management — JWT access token + rotating refresh token.
//
// Cookies (both HttpOnly, SameSite=Lax):
//   tp_session  → JWT access token (HS256, 15min, path=/)
//   tp_refresh  → JWT refresh token (HS256, 30d,  path=/api/auth/refresh)
//
// On `createSession()` we:
//   1. Persist a DB Session row (so the Security Center can list/active-sessions).
//   2. Sign an access JWT carrying { userId, role, kycTier, sid }.
//   3. Sign a refresh JWT carrying { userId }.
//   4. Store the refresh-token hash in the RefreshToken table (for rotation + revocation).
//   5. Set both cookies.
//
// `getSession()` verifies the access JWT, looks up the user, and returns the
// session shape ({ id, userId, user }) that callers expect. If the access JWT
// has expired, callers should POST /api/auth/refresh to rotate.
//
// `refreshSession()` verifies the refresh JWT + DB row (not revoked), revokes
// the old refresh row, issues new access + refresh tokens, persists a new
// RefreshToken row, and sets fresh cookies.
//
// `destroySession()` revokes the refresh row + DB Session row and clears both cookies.

import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { createHash, randomBytes, randomUUID } from "crypto";
import {
  signAccessToken,
  verifyAccessTokenFull,
  signRefreshToken,
  verifyRefreshToken,
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL,
  type AccessTokenClaims,
} from "@/lib/jwt";

export const SESSION_COOKIE = "tp_session";
export const REFRESH_COOKIE = "tp_refresh";
const REFRESH_COOKIE_PATH = "/api/auth/refresh";

// Kept for any legacy callers (no longer used internally).
const SESSION_TTL_DAYS = 7;
void SESSION_TTL_DAYS;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

interface CreateSessionOpts {
  userId: string;
  ip?: string;
  userAgent?: string;
  /** User role at the time of session creation (cached in the JWT). */
  role?: string;
  /** KYC tier at the time of session creation (cached in the JWT). */
  kycTier?: number;
  /** Optional device ID, used to associate refresh tokens with a device. */
  deviceId?: string;
}

/**
 * Create a new session: DB row + JWT access + JWT refresh + cookies.
 *
 * `role` and `kycTier` are optional — if omitted we look them up from the DB
 * so callers (legacy passkey/login routes) don't need to change shape.
 */
export async function createSession(opts: CreateSessionOpts) {
  let role = opts.role;
  let kycTier = opts.kycTier;
  if (role === undefined || kycTier === undefined) {
    const u = await db.user.findUnique({
      where: { id: opts.userId },
      select: { role: true, kycTier: true },
    });
    role = role ?? u?.role ?? "USER";
    kycTier = kycTier ?? u?.kycTier ?? 1;
  }

  const sessionId = randomUUID();
  const sessionTokenSeed = randomBytes(32).toString("hex");
  const now = Date.now();
  const accessExpiresAt = new Date(now + ACCESS_TOKEN_TTL * 1000);
  const refreshExpiresAt = new Date(now + REFRESH_TOKEN_TTL * 1000);

  // 1. DB Session row (for Security Center listing + per-session revocation).
  await db.session.create({
    data: {
      id: sessionId,
      userId: opts.userId,
      tokenHash: hashToken(sessionTokenSeed),
      expiresAt: refreshExpiresAt,
      ip: opts.ip ?? null,
      userAgent: opts.userAgent ?? null,
    },
  });

  // 2. JWT access token.
  // Apply defaults directly at the call site — don't rely on control-flow
  // narrowing of `role`/`kycTier` across the function boundary.
  const accessToken = await signAccessToken({
    userId: opts.userId,
    role: role ?? "USER",
    kycTier: kycTier ?? 1,
    sid: sessionId,
  });

  // 3. JWT refresh token.
  const refreshToken = await signRefreshToken({ userId: opts.userId });

  // 4. Persist the refresh-token hash (for rotation + revocation).
  await db.refreshToken.create({
    data: {
      userId: opts.userId,
      tokenHash: hashToken(refreshToken),
      expiresAt: refreshExpiresAt,
      userAgent: opts.userAgent ?? null,
      ip: opts.ip ?? null,
      deviceId: opts.deviceId ?? null,
    },
  });

  // 5. Set cookies.
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: accessExpiresAt,
  });
  cookieStore.set(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: REFRESH_COOKIE_PATH,
    expires: refreshExpiresAt,
  });

  return { accessToken, refreshToken, sessionId };
}

/**
 * Verify the access-token cookie and return the session. Returns null if the
 * cookie is missing, the JWT is invalid/expired, or the user no longer exists.
 *
 * NOTE: this does NOT consult the DB Session row on every call (JWTs are
 * stateless). Revocation is enforced via the refresh token: when a session is
 * revoked via /api/security/sessions/[id], the refresh token is also revoked,
 * so the access token expires naturally within ≤15 min.
 */
export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const claims: AccessTokenClaims | null = await verifyAccessTokenFull(token);
  if (!claims) return null;
  const user = await db.user.findUnique({ where: { id: claims.userId } });
  if (!user) return null;
  if (user.status !== "ACTIVE") return null;
  return {
    id: claims.sid ?? "unknown",
    userId: user.id,
    user,
  };
}

/**
 * Read the `tp_session` cookie, verify the JWT, and return the decoded
 * payload (or null). Lighter than `getSession()` — no DB lookup.
 */
export async function getAccessToken() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  // Local import to avoid a circular dep at module-load time.
  const { verifyAccessToken } = await import("@/lib/jwt");
  return verifyAccessToken(token);
}

/**
 * Verify the refresh-token cookie, ensure the matching DB row is not revoked,
 * rotate (revoke old + issue new), and set fresh cookies. Returns the user on
 * success or null if the refresh failed (cookies cleared).
 */
export async function refreshSession() {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) return null;

  const claims = await verifyRefreshToken(refreshToken);
  if (!claims) {
    clearAuthCookies(cookieStore);
    return null;
  }

  const tokenHash = hashToken(refreshToken);
  const stored = await db.refreshToken.findUnique({
    where: { tokenHash },
  });

  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    clearAuthCookies(cookieStore);
    return null;
  }
  // Look up the user separately (RefreshToken has no relation defined).
  const user = await db.user.findUnique({ where: { id: stored.userId } });
  if (!user) {
    clearAuthCookies(cookieStore);
    return null;
  }
  if (user.status !== "ACTIVE") {
    clearAuthCookies(cookieStore);
    return null;
  }

  // Revoke the old refresh token (rotation).
  await db.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  const sessionId = randomUUID();
  const sessionTokenSeed = randomBytes(32).toString("hex");
  const now = Date.now();
  const accessExpiresAt = new Date(now + ACCESS_TOKEN_TTL * 1000);
  const refreshExpiresAt = new Date(now + REFRESH_TOKEN_TTL * 1000);

  // Create a new DB Session row (refresh counts as a new login for tracking).
  await db.session.create({
    data: {
      id: sessionId,
      userId: user.id,
      tokenHash: hashToken(sessionTokenSeed),
      expiresAt: refreshExpiresAt,
      ip: stored.ip,
      userAgent: stored.userAgent,
    },
  });

  const newAccessToken = await signAccessToken({
    userId: user.id,
    role: user.role ?? "USER",
    kycTier: user.kycTier ?? 1,
    sid: sessionId,
  });
  const newRefreshToken = await signRefreshToken({ userId: user.id });

  await db.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(newRefreshToken),
      expiresAt: refreshExpiresAt,
      userAgent: stored.userAgent,
      ip: stored.ip,
      deviceId: stored.deviceId,
    },
  });

  cookieStore.set(SESSION_COOKIE, newAccessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: accessExpiresAt,
  });
  cookieStore.set(REFRESH_COOKIE, newRefreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: REFRESH_COOKIE_PATH,
    expires: refreshExpiresAt,
  });

  return user;
}

/**
 * Destroy the current session: revoke the refresh token (so it can't be used
 * to mint new access tokens), revoke the DB Session row (so the Security
 * Center no longer shows it as active), and clear both cookies.
 */
export async function destroySession() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(SESSION_COOKIE)?.value;
  const refreshToken = cookieStore.get(REFRESH_COOKIE)?.value;

  if (refreshToken) {
    try {
      const tokenHash = hashToken(refreshToken);
      const stored = await db.refreshToken.findUnique({
        where: { tokenHash },
        select: { id: true, revokedAt: true },
      });
      if (stored && !stored.revokedAt) {
        await db.refreshToken.update({
          where: { id: stored.id },
          data: { revokedAt: new Date() },
        });
      }
    } catch {
      /* best-effort */
    }
  }

  if (accessToken) {
    try {
      const claims = await verifyAccessTokenFull(accessToken);
      if (claims?.sid) {
        await db.session.update({
          where: { id: claims.sid },
          data: { revokedAt: new Date() },
        });
      }
    } catch {
      /* best-effort */
    }
  }

  clearAuthCookies(cookieStore);
}

function clearAuthCookies(store: Awaited<ReturnType<typeof cookies>>) {
  store.delete(SESSION_COOKIE);
  store.delete({ name: REFRESH_COOKIE, path: REFRESH_COOKIE_PATH });
}
