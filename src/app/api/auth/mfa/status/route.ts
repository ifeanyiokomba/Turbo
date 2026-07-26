// GET /api/auth/mfa/status
// Returns whether MFA is enabled and whether backup codes exist for the user.

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, handleError, requireUser } from "@/lib/api";

export async function GET(_req: NextRequest) {
  try {
    const user = await requireUser();
    const mfa = await db.mfaSecret.findUnique({ where: { userId: user.id } });
    const hasBackupCodes = !!mfa && Array.isArray(safeParse(mfa.backupCodesHash)) && safeParse(mfa.backupCodesHash).length > 0;
    return json({
      enabled: !!mfa?.enabled,
      enabledAt: mfa?.enabledAt ?? null,
      hasBackupCodes,
    });
  } catch (e) {
    return handleError(e);
  }
}

function safeParse(s: string | null | undefined): any[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
