import { db } from "@/lib/db";
import {
  json,
  handleError,
  requireUser,
  audit,
  getClientIp,
  getUserAgent,
  ServiceError,
} from "@/lib/api";
import { KYC_TIER_LIMITS } from "@/lib/constants";

export async function GET() {
  try {
    const user = await requireUser();
    const verifications = await db.kycVerification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    const limits = KYC_TIER_LIMITS[user.kycTier] ?? KYC_TIER_LIMITS[1];

    return json({
      kycTier: user.kycTier,
      kycStatus: user.kycStatus,
      nin: user.nin,
      bvn: user.bvn,
      limits,
      verifications: verifications.map((v) => ({
        id: v.id,
        tier: v.tier,
        status: v.status,
        provider: v.provider,
        verifiedAt: v.verifiedAt,
        createdAt: v.createdAt,
      })),
    });
  } catch (e) {
    return handleError(e);
  }
}

function digitsOnly(s: string): string {
  return s.replace(/\D+/g, "");
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const tier = Number(body?.tier);

    if (tier !== 2 && tier !== 3)
      throw new ServiceError("Invalid tier. Use 2 or 3.", 400, "INVALID_TIER");

    if (tier <= user.kycTier)
      throw new ServiceError(
        `You are already on tier ${user.kycTier}. Higher tiers unlock higher limits.`,
        400,
        "ALREADY_VERIFIED"
      );

    const nin = body?.nin ? digitsOnly(String(body.nin)) : null;
    const bvn = body?.bvn ? digitsOnly(String(body.bvn)) : null;

    if (tier === 2) {
      if (!nin || nin.length !== 11)
        throw new ServiceError("NIN must be 11 digits", 400, "INVALID_NIN");
    } else if (tier === 3) {
      if (!bvn || bvn.length !== 11)
        throw new ServiceError("BVN must be 11 digits", 400, "INVALID_BVN");
    }

    // Mock instant verification — in production this calls NIBSS / NIMC
    const now = new Date();
    const payload = tier === 2 ? { nin } : { bvn };

    const [verification, updated] = await db.$transaction([
      db.kycVerification.create({
        data: {
          userId: user.id,
          tier,
          status: "VERIFIED",
          provider: "turbopay",
          nin: tier === 2 ? nin : null,
          bvn: tier === 3 ? bvn : null,
          payload: JSON.stringify(payload),
          verifiedAt: now,
        },
      }),
      db.user.update({
        where: { id: user.id },
        data: {
          kycTier: tier,
          kycStatus: "VERIFIED",
          nin: tier === 2 ? nin : user.nin,
          bvn: tier === 3 ? bvn : user.bvn,
        },
      }),
    ]);

    await audit({
      userId: user.id,
      action: tier === 2 ? "KYC_TIER2_VERIFY" : "KYC_TIER3_VERIFY",
      category: "KYC",
      severity: "INFO",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: {
        tier,
        verificationId: verification.id,
        identifier:
          tier === 2
            ? nin?.slice(0, 4) + "•••" + nin?.slice(-3)
            : bvn?.slice(0, 4) + "•••" + bvn?.slice(-3),
      },
    });

    return json({
      verification: {
        id: verification.id,
        tier: verification.tier,
        status: verification.status,
        verifiedAt: verification.verifiedAt,
      },
      user: {
        id: updated.id,
        fullName: updated.fullName,
        username: updated.username,
        email: updated.email,
        phone: updated.phone,
        country: updated.country,
        role: updated.role as "USER" | "ADMIN",
        kycTier: updated.kycTier,
        kycStatus: updated.kycStatus,
        status: updated.status,
        emailVerified: updated.emailVerified,
        avatarUrl: updated.avatarUrl,
        hasPin: !!updated.transactionPinHash,
      },
      limits: KYC_TIER_LIMITS[tier],
    });
  } catch (e) {
    return handleError(e);
  }
}
