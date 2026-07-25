import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { json, handleError } from "@/lib/api";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return json({ user: null });
    const u = session.user;
    return json({
      user: {
        id: u.id,
        fullName: u.fullName,
        username: u.username,
        email: u.email,
        phone: u.phone,
        country: u.country,
        role: u.role,
        kycTier: u.kycTier,
        kycStatus: u.kycStatus,
        status: u.status,
        emailVerified: u.emailVerified,
        avatarUrl: u.avatarUrl,
        hasPin: !!u.transactionPinHash,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
