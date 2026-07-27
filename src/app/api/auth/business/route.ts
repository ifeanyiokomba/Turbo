// POST /api/auth/business
//
// Business login — same as regular login but only succeeds if the user is a
// business/merchant account. Identified by:
//   • a Merchant row whose email matches the user's email, OR
//   • the legacy "ADMIN" role (treated as a business in dev), OR
//   • any of the 10 admin roles (they can use the business console too).
//
// On success: creates a session with a `businessMode` flag set in the JWT
// metadata + returns the public user + business context.

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/auth";
import { createSession } from "@/lib/session";
import { json, errorJson, handleError, audit, getClientIp, getUserAgent } from "@/lib/api";
import { rateLimitMiddleware } from "@/lib/rate-limit-helpers";
import { ensureSeed } from "@/lib/seed";
import { trackDevice } from "@/lib/device";
import { logSecurityEvent } from "@/lib/security-log";
import { z } from "zod";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
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
    const limited = await rateLimitMiddleware(req, "login", body?.email);
    if (limited) return limited;

    const parsed = schema.safeParse(body);
    if (!parsed.success) return errorJson("Enter a valid email and password", 400);
    const { email, password } = parsed.data;
    const id = email.trim().toLowerCase();

    const user = await db.user.findUnique({ where: { email: id } });
    // Timing-safe-ish: always hash something even if user not found.
    if (!user) {
      verifyPassword(password, "scrypt$0000$0000");
      await logSecurityEvent({
        type: "LOGIN_FAILED",
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
        metadata: { identifier: id, mode: "business", reason: "user-not-found" },
      });
      return errorJson("Invalid credentials", 401);
    }
    if (user.status !== "ACTIVE") {
      return errorJson("Account is " + user.status.toLowerCase(), 403);
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
        metadata: { mode: "business", reason: "wrong-password" },
      });
      return errorJson("Invalid credentials", 401);
    }

    // Business eligibility: must have a Merchant row OR an admin role.
    const merchant = await db.merchant.findUnique({ where: { email: id } });
    const isBusinessEligible = !!merchant || ADMIN_ROLES.has(user.role);
    if (!isBusinessEligible) {
      await logSecurityEvent({
        userId: user.id,
        type: "ADMIN_ACCESS_DENIED",
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
        severity: "WARN",
        metadata: { reason: "not-a-business-account", mode: "business" },
      });
      return errorJson(
        "Not a business account. Use the regular sign-in instead.",
        403,
        "NOT_BUSINESS"
      );
    }

    // Reset fails + create session.
    await db.user.update({
      where: { id: user.id },
      data: { loginFailCount: 0, loginLockedUntil: null },
    });

    const device = await trackDevice(user.id, req);
    await createSession({
      userId: user.id,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      role: user.role,
      kycTier: user.kycTier,
      deviceId: device.id,
    });

    await audit({
      userId: user.id,
      action: "BUSINESS_LOGIN",
      category: "AUTH",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { merchantId: merchant?.id ?? null, role: user.role },
    });
    await logSecurityEvent({
      userId: user.id,
      type: "LOGIN_SUCCESS",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { mode: "business", merchantId: merchant?.id ?? null, role: user.role },
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
      businessMode: true,
      merchant: merchant
        ? {
            id: merchant.id,
            name: merchant.name,
            businessName: merchant.businessName,
            status: merchant.status,
          }
        : null,
    });
  } catch (e) {
    return handleError(e);
  }
}
