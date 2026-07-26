// Turbopay — step-up OTP verification.
//
// POST /api/auth/step-up/verify
//   body: { code: string }
//
// Verifies the 6-digit OTP issued by /api/auth/step-up. On success the
// in-memory OTP record is marked consumed (so it can't be replayed).
//
// Returns:
//   { verified: true }
//   { verified: false, reason: "no-otp" | "expired" | "already-used"
//                          | "locked" | "mismatch", remainingAttempts?: n }
//
// Audited as STEP_UP_OTP_VERIFIED / STEP_UP_OTP_FAILED.

import { NextRequest } from "next/server";
import {
  json,
  errorJson,
  handleError,
  requireUser,
  audit,
  getClientIp,
  getUserAgent,
} from "@/lib/api";
import { verifyOtp } from "@/lib/otp-cache";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  code: z.string().regex(/^\d{6}$/, "Code must be 6 digits"),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const ip = getClientIp(req);
    const ua = getUserAgent(req);

    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return errorJson(parsed.error.issues[0]?.message ?? "Invalid code", 400, "VALIDATION");
    }
    const { code } = parsed.data;

    const result = verifyOtp(user.id, code);

    if (result.ok) {
      await audit({
        userId: user.id,
        action: "STEP_UP_OTP_VERIFIED",
        category: "AUTH",
        severity: "INFO",
        ip,
        userAgent: ua,
      });
      return json({ verified: true });
    }

    await audit({
      userId: user.id,
      action: "STEP_UP_OTP_FAILED",
      category: "AUTH",
      severity: "WARN",
      ip,
      userAgent: ua,
      metadata: { reason: result.reason, remainingAttempts: result.remainingAttempts },
    });

    return json({
      verified: false,
      reason: result.reason,
      remainingAttempts: result.remainingAttempts,
    });
  } catch (e) {
    return handleError(e);
  }
}
