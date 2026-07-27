// TurboCore — ZTSA Zero Trust Verifier API
//
// POST /api/admin/ztsa/verify
//   { feature, userId, role, kycTier, country, permissions, isAuthenticated, hasMfa, deviceTrusted }
//   Returns: Zero Trust verification result with all checks.

import { json, handleError } from "@/lib/api";
import { requirePermission } from "@/lib/turbocore/rbac";
import { Permissions } from "@/lib/turbocore/rbac/permissions";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await requirePermission(Permissions.CAPABILITIES_VIEW);
    const body = await req.json().catch(() => ({}));

    const { verifyZeroTrust } = await import("@/lib/turbocore/ztsa/zero-trust");

    const result = verifyZeroTrust({
      feature: String(body.feature ?? ""),
      userId: String(body.userId ?? ""),
      role: String(body.role ?? "USER"),
      kycTier: Number(body.kycTier ?? 0),
      country: body.country ?? null,
      permissions: body.permissions ?? [],
      isAuthenticated: Boolean(body.isAuthenticated ?? false),
      hasMfa: Boolean(body.hasMfa ?? false),
      deviceTrusted: Boolean(body.deviceTrusted ?? false),
      riskScore: body.riskScore ? Number(body.riskScore) : undefined,
      ipAddress: body.ipAddress,
      resourceOwnerId: body.resourceOwnerId,
    });

    return json(result);
  } catch (e) {
    return handleError(e);
  }
}
