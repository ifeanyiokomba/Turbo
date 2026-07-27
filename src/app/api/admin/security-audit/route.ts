// Turbopay admin security posture endpoint.
// Returns a checklist of runtime security checks (password hashing, secrets,
// CORS, rate limiting, WebAuthn, TOTP, card encryption, cookie security,
// Sentry). Used by the admin console to surface misconfigurations.

import { json, handleError, requireAdmin, audit, getClientIp, getUserAgent } from "@/lib/api";
import { verifySecurityPosture } from "@/lib/security-audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const posture = await verifySecurityPosture();

    await audit({
      userId: admin.id,
      action: "SECURITY_AUDIT_VIEWED",
      category: "ADMIN",
      severity: "INFO",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: {
        pass: posture.summary.pass,
        warn: posture.summary.warn,
        fail: posture.summary.fail,
      },
    });

    return json(posture);
  } catch (e) {
    return handleError(e);
  }
}
