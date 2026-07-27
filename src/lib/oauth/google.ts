// Google OAuth — token exchange + userinfo fetch.
//
// Both outbound calls to Google (token exchange + userinfo retrieval) pass
// through the SSRF guard BEFORE the network call. This prevents an attacker
// who can control the configured endpoint URLs (e.g. via env var tampering
// or admin console injection) from triggering internal requests.
//
// The well-known Google endpoints are public, so the guard will normally
// pass without incident — but if an attacker manages to redirect the call
// (e.g. by overriding GOOGLE_TOKEN_URL), the guard catches it.

import { validateOutboundUrl, SsrfError } from "@/lib/security/ssrf";

// Well-known Google OAuth endpoints. Overridable via env for test mocks,
// but every override still passes through the SSRF guard.
const TOKEN_URL = process.env.GOOGLE_TOKEN_URL ?? "https://oauth2.googleapis.com/token";
const USERINFO_URL =
  process.env.GOOGLE_USERINFO_URL ?? "https://www.googleapis.com/oauth2/v3/userinfo";

export interface GoogleUserInfo {
  sub: string;
  email: string;
  emailVerified?: boolean;
  name?: string;
  givenName?: string;
  familyName?: string;
  picture?: string;
  locale?: string;
  hd?: string; // hosted domain (Google Workspace)
}

export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
  scope: string;
  token_type: string;
}

/** Required OAuth scope for email + profile + openid. */
export const GOOGLE_SCOPE = "openid email profile https://www.googleapis.com/auth/userinfo.email";

/**
 * Build the Google OAuth authorize URL the browser is redirected to.
 */
export function buildAuthorizeUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
  scope?: string;
}): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: opts.scope ?? GOOGLE_SCOPE,
    state: opts.state,
    access_type: "offline",
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchange an authorization code for Google tokens.
 *
 * Validates `TOKEN_URL` with the SSRF guard before connecting.
 */
export async function exchangeCodeForTokens(opts: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<GoogleTokenResponse> {
  // SSRF guard — runs BEFORE the network call.
  try {
    await validateOutboundUrl(TOKEN_URL);
  } catch (e) {
    if (e instanceof SsrfError) {
      throw new Error(`Google token endpoint blocked by SSRF guard: ${e.message}`);
    }
    throw e;
  }

  const body = new URLSearchParams({
    code: opts.code,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    redirect_uri: opts.redirectUri,
    grant_type: "authorization_code",
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { _raw: text };
  }

  if (!res.ok) {
    const errMsg =
      parsed && typeof parsed === "object" && "error_description" in parsed
        ? String((parsed as { error_description: unknown }).error_description)
        : `Google token exchange failed (HTTP ${res.status})`;
    throw new Error(errMsg);
  }

  return parsed as GoogleTokenResponse;
}

/**
 * Fetch the Google user info for an access token.
 *
 * Validates `USERINFO_URL` with the SSRF guard before connecting.
 */
export async function fetchUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  // SSRF guard — runs BEFORE the network call.
  try {
    await validateOutboundUrl(USERINFO_URL);
  } catch (e) {
    if (e instanceof SsrfError) {
      throw new Error(`Google userinfo endpoint blocked by SSRF guard: ${e.message}`);
    }
    throw e;
  }

  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    throw new Error(`Google userinfo fetch failed (HTTP ${res.status})`);
  }

  // Google returns snake_case fields; map them to our camelCase interface.
  const info = parsed as Record<string, unknown> & {
    email_verified?: string | boolean;
  };
  return {
    sub: String(info.sub ?? ""),
    email: String(info.email ?? ""),
    emailVerified:
      typeof info.email_verified === "string"
        ? info.email_verified === "true"
        : info.email_verified,
    name: typeof info.name === "string" ? info.name : undefined,
    givenName: typeof info.given_name === "string" ? info.given_name : undefined,
    familyName: typeof info.family_name === "string" ? info.family_name : undefined,
    picture: typeof info.picture === "string" ? info.picture : undefined,
    locale: typeof info.locale === "string" ? info.locale : undefined,
    hd: typeof info.hd === "string" ? info.hd : undefined,
  };
}

// Compatibility exports for existing routes
export function isGoogleOAuthConfigured(): boolean {
  return !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REDIRECT_URI
  );
}

export async function getGoogleAuthUrl(state: string): Promise<string> {
  return buildAuthorizeUrl({
    clientId: process.env.GOOGLE_CLIENT_ID!,
    redirectUri: process.env.GOOGLE_REDIRECT_URI!,
    state,
  });
}

export async function exchangeGoogleCode(code: string): Promise<GoogleUserInfo> {
  const tokens = await exchangeCodeForTokens({
    code,
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    redirectUri: process.env.GOOGLE_REDIRECT_URI!,
  });
  return fetchUserInfo(tokens.access_token);
}

export async function createOrLinkGoogleUser(
  info: GoogleUserInfo
): Promise<{ userId: string; isNew: boolean }> {
  const { db } = await import("@/lib/db");
  const { hashPassword } = await import("@/lib/auth");
  const { generateAccountNumber } = await import("@/lib/money");

  // Check if OAuth account already linked
  const existing = await db.oAuthAccount.findUnique({
    where: { providerAccountId: info.sub },
  });
  if (existing) return { userId: existing.userId, isNew: false };

  // Check if user exists by email
  const userByEmail = info.email
    ? await db.user.findUnique({ where: { email: info.email } })
    : null;
  if (userByEmail) {
    await db.oAuthAccount.create({
      data: { provider: "google", providerAccountId: info.sub, userId: userByEmail.id },
    });
    return { userId: userByEmail.id, isNew: false };
  }

  // Create new user
  const newUser = await db.user.create({
    data: {
      email: info.email ?? "",
      fullName: info.name ?? "",
      username: (info.email ?? "").split("@")[0],
      phone: "",
      country: "NG",
      role: "USER",
      kycTier: 0,
      kycStatus: "UNVERIFIED",
      status: "ACTIVE",
      emailVerified: !!info.emailVerified,
      passwordHash: hashPassword(Math.random().toString(36)),
    },
  });

  await db.oAuthAccount.create({
    data: { provider: "google", providerAccountId: info.sub, userId: newUser.id },
  });

  await db.wallet.create({
    data: { userId: newUser.id, balanceKobo: 0, status: "ACTIVE" },
  });

  return { userId: newUser.id, isNew: true };
}
