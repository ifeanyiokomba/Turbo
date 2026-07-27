// POST /api/auth/refresh
//
// Reads the `tp_refresh` cookie, calls `refreshSession()` to:
//   1. Verify the refresh JWT signature + expiry.
//   2. Check the RefreshToken DB row is not revoked.
//   3. Revoke the old refresh token (rotation).
//   4. Issue new access + new refresh tokens.
//   5. Set fresh cookies.
//
// Returns the public user on success. On failure: clears both cookies + 401.

import { NextRequest } from "next/server";
import { json, handleError, audit, getClientIp, getUserAgent } from "@/lib/api";
import { refreshSession } from "@/lib/session";
import { logSecurityEvent } from "@/lib/security-log";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const ua = getUserAgent(req);
    const user = await refreshSession();

    if (!user) {
      await logSecurityEvent({
        type: "SESSION_EXPIRED",
        ip,
        userAgent: ua,
        severity: "WARN",
        metadata: { reason: "invalid-refresh" },
      });
      return json(
        { error: "Session expired. Please sign in again.", code: "SESSION_EXPIRED" },
        401
      );
    }

    await audit({
      userId: user.id,
      action: "SESSION_REFRESHED",
      category: "AUTH",
      severity: "INFO",
      ip,
      userAgent: ua,
    });

    return json({
      user: {
        id: user.id,
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        phone: user.phone,
        country: user.country,
        role: user.role,
        kycTier: user.kycTier,
        kycStatus: user.kycStatus,
        status: user.status,
        emailVerified: user.emailVerified,
        avatarUrl: user.avatarUrl,
        hasPin: !!user.transactionPinHash,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
