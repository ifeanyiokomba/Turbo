// Turbopay — reset-password (verify code + set new password).
//
// POST /api/auth/reset-password  { identifier, code, newPassword }
//
// Flow:
//   1. Look up user by identifier (email/phone/username).
//   2. Verify the 6-digit code against the in-memory store (sha256 hash + 10-min
//      TTL + 5-attempt lockout).
//   3. Validate the new password with `validatePassword` from @/lib/auth
//      (>=8 chars, uppercase, lowercase, digit).
//   4. Hash with `hashPassword` (scrypt), update the user, invalidate the code.
//   5. Revoke ALL the user's active sessions (so any hijacked session is
//      forcibly logged out — they must sign in with the new password).
//   6. Audit PASSWORD_RESET_COMPLETED.
//   7. Return { success: true }.
//
// On any failure (unknown user, bad code, weak password) we return 400 with
// a generic error — we don't reveal which check failed.

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { hashPassword, validatePassword } from "@/lib/auth";
import { json, errorJson, handleError, audit, getClientIp, getUserAgent } from "@/lib/api";
import { verifyCode, invalidate } from "@/lib/password-reset";
import { z } from "zod";

const schema = z.object({
  identifier: z.string().min(3).max(120),
  code: z.string().regex(/^\d{6}$/, "Code must be 6 digits"),
  newPassword: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return errorJson(parsed.error.issues[0].message, 400, "INVALID_REQUEST");
    }
    const { identifier, code, newPassword } = parsed.data;
    const idKey = identifier.trim().toLowerCase();

    // Validate new password strength first so we don't burn the code on a
    // weak password attempt.
    const pwdError = validatePassword(newPassword);
    if (pwdError) {
      return errorJson(pwdError, 400, "WEAK_PASSWORD");
    }

    // Find the user.
    const user =
      (await db.user.findUnique({ where: { email: idKey } })) ??
      (await db.user.findUnique({ where: { phone: identifier.trim() } })) ??
      (await db.user.findUnique({ where: { username: idKey } }));

    if (!user) {
      // Don't reveal account existence — return generic "invalid or expired code".
      return errorJson("Invalid or expired reset code", 400, "INVALID_CODE");
    }

    // Verify the code (consumes it on success).
    const result = verifyCode(identifier, code, user.id);
    if (!result.ok) {
      await audit({
        userId: user.id,
        action: "PASSWORD_RESET_FAILED",
        category: "AUTH",
        severity: "WARN",
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
        metadata: { reason: result.reason ?? "mismatch" },
      });
      return errorJson("Invalid or expired reset code", 400, "INVALID_CODE");
    }

    // Hash + persist the new password.
    const newHash = hashPassword(newPassword);
    await db.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newHash,
        // Reset login lockout too — they've proven identity via the code.
        loginFailCount: 0,
        loginLockedUntil: null,
      },
    });

    // Invalidate any remaining code (in case verifyCode didn't drop it).
    invalidate(identifier);

    // Revoke ALL the user's active sessions so any hijacked session is logged
    // out and they must re-authenticate with the new password.
    try {
      await db.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } catch (e) {
      console.warn("[reset-password] failed to revoke sessions", e);
    }

    await audit({
      userId: user.id,
      action: "PASSWORD_RESET_COMPLETED",
      category: "AUTH",
      severity: "WARN",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { sessionsRevoked: true },
    });

    return json({ success: true }, 200);
  } catch (e) {
    return handleError(e);
  }
}
