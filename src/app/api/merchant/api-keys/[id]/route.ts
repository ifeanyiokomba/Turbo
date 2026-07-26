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

/**
 * DELETE /api/merchant/api-keys/[id]
 * Revokes an API key (sets revokedAt; keyHash is preserved for audit).
 */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;

    const key = await db.merchantApiKey.findFirst({
      where: { id, merchantId: user.id },
    });
    if (!key) {
      throw new ServiceError("API key not found", 404, "NOT_FOUND");
    }
    if (key.revokedAt) {
      throw new ServiceError("API key is already revoked", 400, "ALREADY_REVOKED");
    }

    await db.merchantApiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });

    await audit({
      userId: user.id,
      action: "MERCHANT_API_KEY_REVOKED",
      category: "WALLET",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { keyId: id, prefix: key.prefix },
    });

    return json({ ok: true, revokedAt: new Date().toISOString() });
  } catch (e) {
    return handleError(e);
  }
}
