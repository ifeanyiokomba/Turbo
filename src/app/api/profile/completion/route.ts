// Turbopay — Profile completion API
//
// GET /api/profile/completion
//   - requireUser
//   - returns the 4 profile-completion flags + a computed percentage
//     (hasPin 25%, emailVerified 25%, phoneVerified 25%, kycVerified 25%)
//
// Used by the dashboard "Profile completion" progress card.

import { db } from "@/lib/db";
import { json, handleError, requireUser } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const fresh = await db.user.findUnique({
      where: { id: user.id },
      select: {
        transactionPinHash: true,
        emailVerified: true,
        phoneVerified: true,
        phone: true,
        kycStatus: true,
      },
    });
    if (!fresh) return json({ error: "User not found" }, 404);

    const hasPin = !!fresh.transactionPinHash;
    const emailVerified = !!fresh.emailVerified;
    // Phone is "verified" when both a phone is set AND phoneVerified is true.
    const phoneVerified = !!fresh.phone && !!fresh.phoneVerified;
    const kycVerified = fresh.kycStatus === "VERIFIED";

    const steps = [
      { key: "pin", label: "Transaction PIN set", done: hasPin },
      { key: "email", label: "Email verified", done: emailVerified },
      { key: "phone", label: "Phone verified", done: phoneVerified },
      { key: "kyc", label: "KYC verified", done: kycVerified },
    ];
    const completed = steps.filter((s) => s.done).length;
    const percent = Math.round((completed / steps.length) * 100);

    return json({
      steps,
      completed,
      total: steps.length,
      percent,
      hasPin,
      emailVerified,
      phoneVerified,
      kycVerified,
    });
  } catch (e) {
    return handleError(e);
  }
}
