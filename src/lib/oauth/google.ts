// Turbopay — Google OAuth helpers.
//
// Implements the OAuth 2.0 Authorization Code flow with Google:
//   1. `getGoogleAuthUrl(state)` — builds the redirect URL to Google's consent screen.
//   2. User consents → Google redirects to our callback with `?code=...&state=...`.
//   3. `exchangeGoogleCode(code)` — POSTs the code to Google's token endpoint,
//      receives an access_token, then GETs userinfo to get { sub, email, name, picture }.
//   4. `createOrLinkGoogleUser(googleUser)` — finds the user by email (case-insensitive)
//      or creates a new one. Creates an OAuthAccount row linking provider=google ↔ user.
//
// Required env vars:
//   GOOGLE_CLIENT_ID
//   GOOGLE_CLIENT_SECRET
//   GOOGLE_REDIRECT_URI  (must be registered in Google Cloud Console)
//
// In dev, missing env vars return a friendly error to the caller rather than crashing.

import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { generateAccountNumber } from "@/lib/money";
import { randomBytes } from "crypto";

const GOOGLE_AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

const SCOPES = ["openid", "email", "profile"].join(" ");

export interface GoogleUserInfo {
  sub: string;
  email: string;
  emailVerified?: boolean;
  name?: string;
  givenName?: string;
  familyName?: string;
  picture?: string;
  locale?: string;
}

export interface CreateOrLinkResult {
  user: {
    id: string;
    fullName: string;
    username: string;
    email: string | null;
    phone: string | null;
    country: string;
    role: string;
    kycTier: number;
    kycStatus: string;
    status: string;
    emailVerified: boolean;
    avatarUrl: string | null;
    hasPin: boolean;
  };
  isNew: boolean;
  linked: boolean; // true if we created a NEW OAuthAccount row
}

/**
 * True if Google OAuth is configured (env vars set).
 */
export function isGoogleOAuthConfigured(): boolean {
  return !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REDIRECT_URI
  );
}

/**
 * Build the Google OAuth authorization URL.
 * `state` should be a random token stored in a short-lived cookie; we verify
 * it on callback to prevent CSRF.
 */
export function getGoogleAuthUrl(state: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    throw new Error(
      "Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_REDIRECT_URI."
    );
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return `${GOOGLE_AUTH_BASE}?${params.toString()}`;
}

/**
 * Exchange the authorization code for an access token, then fetch the user's
 * Google profile info.
 */
export async function exchangeGoogleCode(code: string): Promise<GoogleUserInfo> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google OAuth is not configured.");
  }

  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Google token exchange failed: ${errText}`);
  }

  const tokenBody = (await tokenRes.json()) as {
    access_token?: string;
    id_token?: string;
    error?: string;
  };
  if (tokenBody.error || !tokenBody.access_token) {
    throw new Error(`Google token error: ${tokenBody.error ?? "no access_token"}`);
  }

  const userRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokenBody.access_token}` },
  });
  if (!userRes.ok) {
    throw new Error("Google userinfo fetch failed");
  }

  const info = (await userRes.json()) as {
    sub: string;
    email?: string;
    email_verified?: string | boolean;
    name?: string;
    given_name?: string;
    family_name?: string;
    picture?: string;
    locale?: string;
  };

  if (!info.email) {
    throw new Error("Google account has no email — cannot link.");
  }

  return {
    sub: info.sub,
    email: info.email,
    emailVerified: info.email_verified === true || info.email_verified === "true",
    name: info.name,
    givenName: info.given_name,
    familyName: info.family_name,
    picture: info.picture,
    locale: info.locale,
  };
}

/**
 * Find an existing user by email, OR create a new one. Either way, ensure an
 * OAuthAccount row links `google:sub` ↔ `user.id`.
 *
 * Behaviour:
 *   • If we already have an OAuthAccount for (provider=google, providerAccountId=sub),
 *     return that user. (Returning user logging in again.)
 *   • Else if a user with the same email exists, link the OAuthAccount to them
 *     and return the user. (User signed up with password, now adding Google.)
 *   • Else create a new user (random password — they'll log in via Google),
 *     wallet, virtual account, and link the OAuthAccount.
 */
export async function createOrLinkGoogleUser(
  googleUser: GoogleUserInfo
): Promise<CreateOrLinkResult> {
  // 1. Existing link? (providerAccountId is globally unique in our schema.)
  const existingLink = await db.oAuthAccount.findUnique({
    where: { providerAccountId: googleUser.sub },
  });
  if (existingLink) {
    const user = await db.user.findUnique({ where: { id: existingLink.userId } });
    if (!user) throw new Error("OAuth link references missing user");
    return {
      user: publicUser(user),
      isNew: false,
      linked: false,
    };
  }

  // 2. Existing user with matching email?
  const emailLower = googleUser.email.toLowerCase();
  const existingUser = await db.user.findUnique({
    where: { email: emailLower },
  });

  if (existingUser) {
    // Link OAuthAccount to the existing user.
    await db.oAuthAccount.create({
      data: {
        userId: existingUser.id,
        provider: "google",
        providerAccountId: googleUser.sub,
        email: googleUser.email,
        name: googleUser.name ?? null,
        avatarUrl: googleUser.picture ?? null,
      },
    });
    // Optionally update avatar / emailVerified if Google says so.
    if (googleUser.emailVerified && !existingUser.emailVerified) {
      await db.user.update({
        where: { id: existingUser.id },
        data: {
          emailVerified: true,
          avatarUrl: existingUser.avatarUrl ?? googleUser.picture ?? null,
        },
      });
    }
    const refreshed = await db.user.findUnique({ where: { id: existingUser.id } });
    if (!refreshed) throw new Error("User vanished mid-link");
    return {
      user: publicUser(refreshed),
      isNew: false,
      linked: true,
    };
  }

  // 3. Create a brand-new user.
  const baseName = googleUser.name?.trim() || googleUser.email.split("@")[0];
  const parts = baseName.split(/\s+/);
  const givenName = googleUser.givenName ?? parts[0] ?? "User";
  const familyName = googleUser.familyName ?? parts.slice(1).join(" ") ?? "";
  const fullName = `${givenName} ${familyName}`.trim() || baseName;

  // Unique username — base + 4-hex suffix.
  const usernameBase = (givenName.replace(/[^a-z0-9_]/gi, "").toLowerCase() || "user").slice(0, 16);
  let username = `${usernameBase}${randomBytes(2).toString("hex")}`;
  while (await db.user.findUnique({ where: { username } })) {
    username = `${usernameBase}${randomBytes(2).toString("hex")}`;
  }

  // Random password — the user will log in via Google, but passwordHash is
  // non-nullable in the schema. They can later set a password via "forgot password".
  const randomPassword = randomBytes(32).toString("hex");
  const passwordHash = hashPassword(randomPassword);

  const user = await db.user.create({
    data: {
      fullName,
      username,
      email: googleUser.email,
      country: "NG",
      passwordHash,
      role: "USER",
      kycTier: 1,
      kycStatus: "UNVERIFIED",
      emailVerified: googleUser.emailVerified ?? false,
      phoneVerified: false,
      avatarUrl: googleUser.picture ?? null,
    },
  });

  // Wallet + virtual account (mirrors the regular register flow).
  await db.wallet.create({ data: { userId: user.id, balanceKobo: 0 } });
  await db.virtualAccount.create({
    data: {
      userId: user.id,
      accountNumber: generateAccountNumber(),
      accountName: fullName.toUpperCase(),
      provider: "turbopay",
    },
  });

  // Link the OAuth account.
  await db.oAuthAccount.create({
    data: {
      userId: user.id,
      provider: "google",
      providerAccountId: googleUser.sub,
      email: googleUser.email,
      name: googleUser.name ?? null,
      avatarUrl: googleUser.picture ?? null,
    },
  });

  return {
    user: publicUser(user),
    isNew: true,
    linked: true,
  };
}

function publicUser(u: {
  id: string;
  fullName: string;
  username: string;
  email: string | null;
  phone: string | null;
  country: string;
  role: string;
  kycTier: number;
  kycStatus: string;
  status: string;
  emailVerified: boolean;
  avatarUrl: string | null;
  transactionPinHash: string | null;
}) {
  return {
    id: u.id,
    fullName: u.fullName,
    username: u.username,
    email: u.email,
    phone: u.phone,
    country: u.country,
    role: u.role,
    kycTier: u.kycTier,
    kycStatus: u.kycStatus,
    status: u.status,
    emailVerified: u.emailVerified,
    avatarUrl: u.avatarUrl,
    hasPin: !!u.transactionPinHash,
  };
}
