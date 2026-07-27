// GET /api/auth/google/callback
//
// OAuth 2.0 callback handler. Google redirects here with `?code=...&state=...`.
//   1. Verify the `state` query param matches the `tp_oauth_state` cookie (CSRF).
//   2. Exchange the code for a Google access token + userinfo.
//   3. Create or link the user (see createOrLinkGoogleUser).
//   4. Track the device.
//   5. Create a session (JWT access + refresh + cookies).
//   6. Redirect to `/` (or to `/?onboarding=1` if the user was just created).
//
// Errors redirect to `/?auth_error=...` so the AuthScreen can surface them.

import { NextRequest, NextResponse } from "next/server";
import { exchangeGoogleCode, createOrLinkGoogleUser } from "@/lib/oauth/google";
import { createSession } from "@/lib/session";
import { trackDevice } from "@/lib/device";
import { logSecurityEvent } from "@/lib/security-log";
import { getClientIp, getUserAgent, audit } from "@/lib/api";

const STATE_COOKIE = "tp_oauth_state";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return redirectToAuth(`google_error:${error}`);
  }
  if (!code || !state) {
    return redirectToAuth("missing_code_or_state");
  }

  // Verify state cookie matches.
  const stateCookie = req.cookies.get(STATE_COOKIE)?.value;
  if (!stateCookie || stateCookie !== state) {
    return redirectToAuth("state_mismatch");
  }

  try {
    const googleUser = await exchangeGoogleCode(code);
    const { user, isNew, linked } = await createOrLinkGoogleUser(googleUser);

    const ip = getClientIp(req);
    const ua = getUserAgent(req);

    // Track device.
    const device = await trackDevice(user.id, req);

    await createSession({
      userId: user.id,
      ip,
      userAgent: ua,
      role: user.role,
      kycTier: user.kycTier,
      deviceId: device.id,
    });

    await audit({
      userId: user.id,
      action: isNew ? "OAUTH_REGISTER" : "OAUTH_LOGIN",
      category: "AUTH",
      severity: "INFO",
      ip,
      userAgent: ua,
      metadata: { provider: "google", isNew, linked, googleSub: googleUser.sub },
    });

    await logSecurityEvent({
      userId: user.id,
      type: isNew ? "OAUTH_LINKED" : "LOGIN_SUCCESS",
      ip,
      userAgent: ua,
      metadata: {
        provider: "google",
        method: "oauth",
        isNew,
        linked,
      },
    });

    // Clear the state cookie + redirect to app.
    const redirectUrl = isNew ? `${APP_URL}/?onboarding=1` : `${APP_URL}/`;
    const res = NextResponse.redirect(redirectUrl);
    res.cookies.delete(STATE_COOKIE);
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown_error";
    return redirectToAuth(`exchange_failed:${msg}`);
  }
}

function redirectToAuth(reason: string): NextResponse {
  const url = new URL("/", APP_URL);
  url.searchParams.set("auth_error", reason);
  const res = NextResponse.redirect(url);
  res.cookies.delete(STATE_COOKIE);
  return res;
}
