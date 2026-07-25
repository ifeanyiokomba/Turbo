// Turbopay — step-up authentication (OTP for high-value transactions).
//
// POST /api/auth/step-up
//   body: { amountKobo: number }
//
// If `amountKobo` exceeds 50% of the user's KYC-tier single-tx limit,
// we issue a 6-digit OTP (stored in the in-memory otp-cache) and
// "send" it via SMS/email. In production the channel would call a real
// SMS gateway; here we log the code in dev and return the channel.
//
// Returns:
//   { required: true, channel: "SMS", expiresInSeconds: 600 }
//   { required: false }
//
// Audited as STEP_UP_OTP_ISSUED.

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
import { KYC_TIER_LIMITS } from "@/lib/constants";
import { issueOtp, STEP_UP_THRESHOLD_DIVISOR } from "@/lib/otp-cache";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  amountKobo: z.number().int().positive(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return errorJson(parsed.error.issues[0]?.message ?? "Invalid amount", 400, "VALIDATION");
    }
    const { amountKobo } = parsed.data;

    const limit = KYC_TIER_LIMITS[user.kycTier] ?? KYC_TIER_LIMITS[1];
    const threshold = Math.floor(limit.singleTxLimitKobo / STEP_UP_THRESHOLD_DIVISOR);

    if (amountKobo <= threshold) {
      return json({ required: false, amountKobo, threshold });
    }

    // Pick a channel: SMS if phone verified, else email, else SMS anyway
    // (we still log it in dev).
    const channel: "SMS" | "EMAIL" | "WHATSAPP" = user.phoneVerified
      ? "SMS"
      : user.emailVerified
        ? "EMAIL"
        : "SMS";

    const issued = issueOtp(user.id, amountKobo, channel);

    // In dev we log the code so the test user can read it from the
    // server logs. In prod this is where we'd call an SMS gateway.
    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[step-up] OTP for ${user.username} (${channel}): ${issued.code} ` +
          `(amount=${amountKobo} kobo, threshold=${threshold} kobo)`,
      );
    }

    await audit({
      userId: user.id,
      action: "STEP_UP_OTP_ISSUED",
      category: "AUTH",
      severity: "INFO",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: {
        amountKobo,
        threshold,
        channel,
        kycTier: user.kycTier,
      },
    });

    return json({
      required: true,
      channel,
      expiresInSeconds: 600,
      // In dev only, echo the code so the preview UI can show it
      // (avoids requiring an actual SMS gateway for the demo).
      devCode: process.env.NODE_ENV !== "production" ? issued.code : undefined,
    });
  } catch (e) {
    return handleError(e);
  }
}
