// POST /api/auth/mfa/setup
// Generates a new TOTP secret (not yet enabled), encrypts it, and stores it
// in MfaSecret (enabled=false). Returns {secret, uri} so the frontend can
// render a QR code.

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, errorJson, handleError, requireUser } from "@/lib/api";
import { generateMfaSecret, encryptMfaSecret } from "@/lib/mfa";

export async function POST(_req: NextRequest) {
  try {
    const user = await requireUser();
    const label = user.email ?? user.username;

    const { secret, uri } = generateMfaSecret(label);
    const encSecret = encryptMfaSecret(secret);

    // Upsert: if there's an existing (disabled or enabled) row, replace the
    // secret and reset enabled=false so the user can re-scan.
    await db.mfaSecret.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        secretEnc: encSecret,
        enabled: false,
        backupCodesHash: "[]",
      },
      update: {
        secretEnc: encSecret,
        enabled: false,
        enabledAt: null,
        backupCodesHash: "[]",
      },
    });

    return json({ secret, uri });
  } catch (e) {
    return handleError(e);
  }
}
