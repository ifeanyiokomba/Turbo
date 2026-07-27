// POST /api/auth/mfa/disable
// Body: { password }
// Verifies the user's password, then disables MFA and clears the secret +
// backup codes. Audits the disable action.

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  json,
  errorJson,
  handleError,
  requireUser,
  audit,
  getClientIp,
  getUserAgent,
} from "@/lib/api";
import { verifyPassword } from "@/lib/auth";
import { logSecurityEvent } from "@/lib/security-log";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => null);
    const password: string = typeof body?.password === "string" ? body.password : "";
    if (!password) return errorJson("Password is required", 400, "PASSWORD_REQUIRED");

    if (!verifyPassword(password, user.passwordHash)) {
      await audit({
        userId: user.id,
        action: "MFA_DISABLE_FAILED",
        category: "AUTH",
        severity: "WARN",
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
      });
      await logSecurityEvent({
        userId: user.id,
        type: "MFA_FAILED",
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
        metadata: { reason: "disable-wrong-password" },
      });
      return errorJson("Incorrect password", 401, "INVALID_PASSWORD");
    }

    const mfa = await db.mfaSecret.findUnique({ where: { userId: user.id } });
    if (!mfa || !mfa.enabled) {
      return errorJson("MFA is not enabled", 400, "NOT_ENABLED");
    }

    await db.mfaSecret.update({
      where: { userId: user.id },
      data: {
        enabled: false,
        enabledAt: null,
        secretEnc: "",
        backupCodesHash: "[]",
      },
    });

    await audit({
      userId: user.id,
      action: "MFA_DISABLED",
      category: "AUTH",
      severity: "WARN",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });
    await logSecurityEvent({
      userId: user.id,
      type: "MFA_DISABLED",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });

    return json({ disabled: true });
  } catch (e) {
    return handleError(e);
  }
}
