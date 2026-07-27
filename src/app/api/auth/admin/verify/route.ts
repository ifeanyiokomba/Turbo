// POST /api/auth/admin/verify
//
// Admin login — step 2 (MFA / OTP verification).
//
// Body: { identifier, otp }
//   • `identifier` must match the one used in step 1.
//   • `otp` is either the 6-digit TOTP from the user's authenticator app
//     (when MFA is enabled) OR the 6-digit OTP we sent via SMS/email (when not).
//
// On success: creates a session + returns the public user with `adminMode: true`.
// On failure: 401 + reason. Audits each attempt.

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { createSession } from "@/lib/session";
import { json, errorJson, handleError, audit, getClientIp, getUserAgent } from "@/lib/api";
import { rateLimitMiddleware } from "@/lib/rate-limit-helpers";
import { ensureSeed } from "@/lib/seed";
import { verifyTotp, decryptMfaSecret } from "@/lib/mfa";
import { verifyOtp } from "@/lib/otp-cache";
import { trackDevice } from "@/lib/device";
import { logSecurityEvent } from "@/lib/security-log";
import { z } from "zod";

const schema = z.object({
  identifier: z.string().min(3),
  otp: z.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
});

const ADMIN_ROLES = new Set([
  "ADMIN",
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
    if (!parsed.success) {
      return errorJson(parsed.error.issues[0]?.message ?? "Invalid request", 400);
    }
    const { identifier, otp } = parsed.data;
    const id = identifier.trim().toLowerCase();

    const user =
      (await db.user.findUnique({ where: { email: id } })) ??
      (await db.user.findUnique({ where: { phone: identifier } })) ??
      (await db.user.findUnique({ where: { username: id } }));

    if (!user) {
      return errorJson("Invalid credentials", 401);
    }
    if (user.status !== "ACTIVE") {
      return errorJson("Account is " + user.status.toLowerCase(), 403);
    }
    if (!ADMIN_ROLES.has(user.role)) {
      return errorJson("Admin access required", 403, "NOT_ADMIN");
    }

    const ip = getClientIp(req);
    const ua = getUserAgent(req);

    // Step-up verification: TOTP if MFA enabled, else OTP cache.
    const mfa = await db.mfaSecret.findUnique({ where: { userId: user.id } });
    let verified = false;
    let reason = "";

    if (mfa?.enabled) {
      try {
        const secret = decryptMfaSecret(mfa.secretEnc);
        if (verifyTotp(otp, secret)) {
          verified = true;
        } else {
          reason = "invalid-totp";
        }
      } catch {
        reason = "mfa-decrypt-failed";
      }
    } else {
      const result = verifyOtp(user.id, otp);
      if (result.ok) {
        verified = true;
      } else {
        reason = result.reason ?? "invalid-otp";
      }
    }

    if (!verified) {
      await logSecurityEvent({
        userId: user.id,
        type: "MFA_FAILED",
        ip,
        userAgent: ua,
        severity: "WARN",
        metadata: { mode: "admin", reason },
      });
      return errorJson("Incorrect code. Please try again.", 401, "INVALID_OTP");
    }

    // Step-up complete — create admin session.
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
      action: "ADMIN_LOGIN",
      category: "AUTH",
      severity: "INFO",
      ip,
      userAgent: ua,
      metadata: { role: user.role, method: mfa?.enabled ? "totp" : "otp" },
    });
    await logSecurityEvent({
      userId: user.id,
      type: "ADMIN_LOGIN",
      ip,
      userAgent: ua,
      metadata: { role: user.role, method: mfa?.enabled ? "totp" : "otp" },
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
      adminMode: true,
    });
  } catch (e) {
    return handleError(e);
  }
}
