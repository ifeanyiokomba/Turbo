// POST /api/auth/mfa/regenerate-codes
// Body: { password }
// Re-verifies the user's password, then generates a fresh set of backup codes
// (replacing the previous set). Returns the new codes (shown ONCE).
// Used by the "View backup codes" UI flow when MFA is already enabled.

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, errorJson, handleError, requireUser, audit, getClientIp, getUserAgent } from "@/lib/api";
import { verifyPassword } from "@/lib/auth";
import { generateBackupCodes, hashBackupCodes } from "@/lib/mfa";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => null);
    const password: string = typeof body?.password === "string" ? body.password : "";
    if (!password) return errorJson("Password is required", 400, "PASSWORD_REQUIRED");

    if (!verifyPassword(password, user.passwordHash)) {
      await audit({
        userId: user.id,
        action: "MFA_REGEN_CODES_FAILED",
        category: "AUTH",
        severity: "WARN",
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
      });
      return errorJson("Incorrect password", 401, "INVALID_PASSWORD");
    }

    const mfa = await db.mfaSecret.findUnique({ where: { userId: user.id } });
    if (!mfa || !mfa.enabled) {
      return errorJson("MFA is not enabled", 400, "NOT_ENABLED");
    }

    const backupCodes = generateBackupCodes();
    const backupHashes = hashBackupCodes(backupCodes);
    await db.mfaSecret.update({
      where: { userId: user.id },
      data: { backupCodesHash: backupHashes },
    });

    await audit({
      userId: user.id,
      action: "MFA_BACKUP_CODES_REGENERATED",
      category: "AUTH",
      severity: "WARN",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });

    return json({ backupCodes });
  } catch (e) {
    return handleError(e);
  }
}
