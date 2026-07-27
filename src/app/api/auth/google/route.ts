// GET /api/auth/google
//
// Initiates the Google OAuth flow:
//   1. Generate a random `state` token (CSRF protection).
//   2. Store it in a short-lived HttpOnly cookie (tp_oauth_state).
//   3. Redirect to Google's consent screen.
//
// The callback at /api/auth/google/callback verifies the state cookie matches
// the state query param before exchanging the code.

import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getGoogleAuthUrl, isGoogleOAuthConfigured } from "@/lib/oauth/google";
import { handleError } from "@/lib/api";

const STATE_COOKIE = "tp_oauth_state";
const STATE_TTL_SECONDS = 10 * 60; // 10 minutes

export async function GET() {
  try {
    if (!isGoogleOAuthConfigured()) {
      return NextResponse.json(
        {
          error:
            "Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI in your environment.",
          code: "OAUTH_NOT_CONFIGURED",
        },
        { status: 503 }
      );
    }

    const state = randomBytes(16).toString("hex");
    const authUrl = await getGoogleAuthUrl(state);

    const res = NextResponse.redirect(authUrl);
    res.cookies.set(STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: STATE_TTL_SECONDS,
    });
    return res;
  } catch (e) {
    return handleError(e);
  }
}
