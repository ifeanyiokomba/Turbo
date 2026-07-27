// POST /api/auth/admin
//
// Admin login — step 1 (credentials only). On success, does NOT create a
// session yet — instead it requires a step-up:
//
//   • If the user has MFA enabled: returns { requiresMFA: true }.
//     The client should POST /api/auth/admin/verify with the 6-digit TOTP code.
//   • Else (no MFA): we issue a 6-digit OTP via the existing otp-cache
//     (delivered via SMS/email/console.log in dev) and return
//     { requiresOTP: true, channel, devCode? }.
//     The client should POST /api/auth/admin/verify with the 6-digit OTP.
//
// Only users whose role is one of the 10 admin roles (or the legacy "ADMIN")
// may use this endpoint. Other users get a 403 — they should use the regular
// login instead.

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/auth";
import { decryptMfaSecret } from "@/lib/mfa";
import { json, errorJson, handleError, audit, getClientIp, getUserAgent } from "@/lib/api";
import { rateLimitMiddleware } from "@/lib/rate-limit-helpers";
import { ensureSeed } from "@/lib/seed";
import { issueAdminOtp } from "@/lib/admin-otp-cache";
import { logSecurityEvent } from "@/lib/security-log";
import { z } from "zod";

const schema = z.object({
  identifier: z.string().min(3),
  password: z.string().min(1),
});

const ADMIN_ROLES = new Set([
  "ADMIN", // legacy
  "SUPER_ADMIN",
  "ADMINISTRATOR",
  "FINANCE_OFFICER",
  "COMPLIANCE_OFFICER",
  "SUPPORT_OFFICER",
  "OPERATIONS_OFFICER",
  "RISK_OFFICER",
  "DEVELOPER",
  "AUDITOR",
  "READONLY_ANALYST",
]);

export async function POST(req: NextRequest) {
  try {
    await ensureSeed();
    const body = await req.json().catch(() => ({}));
    const limited = await rateLimitMiddleware(req, "login", body?.identifier);
    if (limited) return limited;

    const parsed = schema.safeParse(body);
    if (!parsed.success) return errorJson("Invalid credentials", 400);
    const { identifier, password } = parsed.data;
    const id = identifier.trim().toLowerCase();

    const user =
      (await db.user.findUnique({ where: { email: id } })) ??
      (await db.user.findUnique({ where: { phone: identifier } })) ??
      (await db.user.findUnique({ where: { username: id } }));

    // Timing-safe-ish: always hash something even if user not found.
    if (!user) {
      verifyPassword(password, "scrypt$0000$0000");
      await logSecurityEvent({
        type: "ADMIN_ACCESS_DENIED",
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
        severity: "WARN",
        metadata: { identifier: id, reason: "user-not-found" },
      });
      return errorJson("Invalid credentials", 401);
    }
    if (user.status !== "ACTIVE") {
      return errorJson("Account is " + user.status.toLowerCase(), 403);
    }

    // Admin role check.
    if (!ADMIN_ROLES.has(user.role)) {
      await logSecurityEvent({
        userId: user.id,
        type: "ADMIN_ACCESS_DENIED",
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
        severity: "WARN",
        metadata: { reason: "not-an-admin", role: user.role },
      });
      return errorJson("Admin access required. Use the regular sign-in instead.", 403, "NOT_ADMIN");
    }

    // Lockout check.
    if (user.loginLockedUntil && user.loginLockedUntil > new Date()) {
      const mins = Math.ceil((user.loginLockedUntil.getTime() - Date.now()) / 60000);
      return errorJson(`Too many attempts. Try again in ${mins} min.`, 429);
    }

    // Verify password.
    if (!verifyPassword(password, user.passwordHash)) {
      const fails = user.loginFailCount + 1;
      const lockUntil = fails >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
      await db.user.update({
        where: { id: user.id },
        data: { loginFailCount: fails, loginLockedUntil: lockUntil },
      });
      await logSecurityEvent({
        userId: user.id,
        type: "LOGIN_FAILED",
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
        metadata: { mode: "admin", reason: "wrong-password" },
      });
      return errorJson("Invalid credentials", 401);
    }

    // Reset fail counters — password was correct.
    await db.user.update({
      where: { id: user.id },
      data: { loginFailCount: 0, loginLockedUntil: null },
    });

    // Determine step-up requirement.
    const mfa = await db.mfaSecret.findUnique({ where: { userId: user.id } });
    const ip = getClientIp(req);
    const ua = getUserAgent(req);

    if (mfa?.enabled) {
      // Decrypt the secret so the verify route can compare TOTPs.
      // (We don't return the secret — just signal that MFA is required.)
      try {
        // Sanity check that decryption works — no point asking the user for a
        // TOTP we can't verify.
        decryptMfaSecret(mfa.secretEnc);
      } catch {
        return errorJson(
          "MFA secret could not be decrypted. Contact an administrator.",
          500,
          "MFA_CORRUPT"
        );
      }

      await audit({
        userId: user.id,
        action: "ADMIN_LOGIN_CHALLENGE",
        category: "AUTH",
        severity: "INFO",
        ip,
        userAgent: ua,
        metadata: { step: "mfa" },
      });

      return json({
        requiresMFA: true,
        challenge: "totp",
        identifier: id,
      });
    }

    // No MFA — issue a one-time step-up OTP.
    const channel: "SMS" | "EMAIL" | "WHATSAPP" = user.phoneVerified
      ? "SMS"
      : user.emailVerified
        ? "EMAIL"
        : "SMS";
    const issued = issueAdminOtp(user.id, channel);

    if (process.env.NODE_ENV !== "production") {
      console.log(`[admin-login] Step-up OTP for ${user.username} (${channel}): ${issued.code}`);
    }

    await audit({
      userId: user.id,
      action: "ADMIN_LOGIN_CHALLENGE",
      category: "AUTH",
      severity: "INFO",
      ip,
      userAgent: ua,
      metadata: { step: "otp", channel },
    });

    return json({
      requiresOTP: true,
      channel,
      expiresInSeconds: 600,
      identifier: id,
      // Echo the code in dev so the preview UI can show it without an SMS gateway.
      devCode: process.env.NODE_ENV !== "production" ? issued.code : undefined,
    });
  } catch (e) {
    return handleError(e);
  }
}
