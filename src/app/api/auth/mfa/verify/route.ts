// POST /api/auth/mfa/verify
// Body: { token }
// Verifies the 6-digit TOTP token against the user's pending secret, enables
// MFA, generates backup codes (shown ONCE), hashes & stores them.

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
import { decryptMfaSecret, verifyTotp, generateBackupCodes, hashBackupCodes } from "@/lib/mfa";
import { logSecurityEvent } from "@/lib/security-log";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => null);
    const token: string = typeof body?.token === "string" ? body.token.trim() : "";
    if (!/^\d{6}$/.test(token)) {
      return errorJson("Enter the 6-digit code from your authenticator app", 400, "INVALID_TOKEN");
    }

    const mfa = await db.mfaSecret.findUnique({ where: { userId: user.id } });
    if (!mfa) {
      return errorJson("Start MFA setup first", 400, "NO_SETUP");
    }
    if (mfa.enabled) {
      return errorJson("MFA is already enabled", 400, "ALREADY_ENABLED");
    }

    const secret = decryptMfaSecret(mfa.secretEnc);
    if (!verifyTotp(token, secret)) {
      return errorJson(
        "Incorrect code. Make sure your device time is correct.",
        400,
        "INVALID_TOKEN"
      );
    }

    const backupCodes = generateBackupCodes();
    const backupHashes = hashBackupCodes(backupCodes);

    await db.mfaSecret.update({
      where: { userId: user.id },
      data: {
        enabled: true,
        enabledAt: new Date(),
        backupCodesHash: backupHashes,
      },
    });

    await audit({
      userId: user.id,
      action: "MFA_ENABLED",
      category: "AUTH",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });
    await logSecurityEvent({
      userId: user.id,
      type: "MFA_ENABLED",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });

    return json({ enabled: true, backupCodes });
  } catch (e) {
    return handleError(e);
  }
}
