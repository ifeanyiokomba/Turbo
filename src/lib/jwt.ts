// Turbopay — JWT helpers (jose, HS256).
//
// Access tokens: short-lived (15 min), carry { userId, role, kycTier } + sid.
// Refresh tokens: long-lived (30 d), carry { userId }. Rotated on each refresh.
//
// Both are signed with JWT_SECRET (env). In production, JWT_SECRET MUST be set;
// in dev we fall back to a deterministic demo secret and warn loudly.
//
// Cookies (set by session.ts):
//   tp_session  → access JWT (15min, path=/)
//   tp_refresh  → refresh JWT (30d,  path=/api/auth/refresh)

import { SignJWT, jwtVerify } from "jose";
import { randomUUID } from "crypto";

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

const ISSUER = "turbopay";
const ACCESS_AUDIENCE = "turbopay-client";
const REFRESH_AUDIENCE = "turbopay-refresh";

/** Public JWT payload shape (per spec). */
export interface JWTPayload {
  userId: string;
  role: string;
  kycTier: number;
  iat: number;
  exp: number;
}

/**
 * Extended access-token claims used internally by `getSession()`. The `sid`
 * (session id) claim lets us associate a stateless JWT with a DB Session row
 * for the Security Center's "Active sessions" list + per-session revocation.
 */
export interface AccessTokenClaims extends JWTPayload {
  sid?: string;
}

interface RefreshTokenClaims {
  userId: string;
  iat: number;
  exp: number;
}

const DEV_DEFAULT_SECRET = "turbopay-dev-secret-change-me-please-32bytes!";

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "JWT_SECRET environment variable is required in production. Generate with: openssl rand -hex 32"
      );
    }
    if (!globalThis.__TP_JWT_SECRET_WARNED) {
      console.warn(
        "[jwt] JWT_SECRET not set — using insecure dev default. Set JWT_SECRET in production."
      );
      globalThis.__TP_JWT_SECRET_WARNED = true;
    }
    return new TextEncoder().encode(DEV_DEFAULT_SECRET);
  }
  if (secret.length < 16) {
    throw new Error("JWT_SECRET must be at least 16 characters");
  }
  return new TextEncoder().encode(secret);
}

// Augment globalThis so we only warn once per process.
declare global {
  var __TP_JWT_SECRET_WARNED: boolean | undefined;
}

/**
 * Sign a short-lived (15min) HS256 access JWT containing the user identity
 * claims + the session id.
 */
export async function signAccessToken(payload: {
  userId: string;
  role: string;
  kycTier: number;
  sid?: string;
}): Promise<string> {
  return new SignJWT({
    userId: payload.userId,
    role: payload.role,
    kycTier: payload.kycTier,
    sid: payload.sid,
    type: "access",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .setIssuer(ISSUER)
    .setAudience(ACCESS_AUDIENCE)
    .sign(getJwtSecret());
}

/**
 * Verify + decode an access token. Returns null if the signature is invalid,
 * the token is expired, or the type/audience doesn't match.
 */
export async function verifyAccessToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      issuer: ISSUER,
      audience: ACCESS_AUDIENCE,
    });
    if (payload.type !== "access") return null;
    return {
      userId: String(payload.userId),
      role: String(payload.role),
      kycTier: Number(payload.kycTier),
      iat: Number(payload.iat),
      exp: Number(payload.exp),
    };
  } catch {
    return null;
  }
}

/**
 * Verify + decode an access token, returning the full claims (including `sid`).
 * Used internally by `getSession()` so it can match a JWT to its DB Session row.
 */
export async function verifyAccessTokenFull(token: string): Promise<AccessTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      issuer: ISSUER,
      audience: ACCESS_AUDIENCE,
    });
    if (payload.type !== "access") return null;
    return {
      userId: String(payload.userId),
      role: String(payload.role),
      kycTier: Number(payload.kycTier),
      iat: Number(payload.iat),
      exp: Number(payload.exp),
      sid: payload.sid ? String(payload.sid) : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Sign a long-lived (30-day) HS256 refresh JWT carrying just { userId }.
 * Refresh tokens are rotated on every refresh — the old token is revoked in
 * the RefreshToken table, and a new one is issued.
 */
export async function signRefreshToken(payload: { userId: string }): Promise<string> {
  return new SignJWT({
    userId: payload.userId,
    type: "refresh",
    // Random JWT ID guarantees uniqueness across two refresh tokens issued for
    // the same user within the same second (otherwise iat+exp+userId would be
    // identical and the SHA-256 tokenHash would collide in the DB).
    jti: randomUUID(),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${REFRESH_TOKEN_TTL_SECONDS}s`)
    .setIssuer(ISSUER)
    .setAudience(REFRESH_AUDIENCE)
    .sign(getJwtSecret());
}

/**
 * Verify a refresh token's signature + expiry. Returns { userId } or null.
 * NOTE: callers must additionally check the RefreshToken table to ensure the
 * token hasn't been revoked — `verifyRefreshToken` only checks the JWT itself.
 */
export async function verifyRefreshToken(token: string): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      issuer: ISSUER,
      audience: REFRESH_AUDIENCE,
    });
    if (payload.type !== "refresh") return null;
    return { userId: String(payload.userId) };
  } catch {
    return null;
  }
}

/** Used by session.ts to compute cookie expiry. */
export const ACCESS_TOKEN_TTL = ACCESS_TOKEN_TTL_SECONDS;
export const REFRESH_TOKEN_TTL = REFRESH_TOKEN_TTL_SECONDS;

/** Type-only re-export so callers can reference the refresh claims shape. */
export type { RefreshTokenClaims };
