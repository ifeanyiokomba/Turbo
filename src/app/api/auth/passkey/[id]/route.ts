// DELETE /api/auth/passkey/[id]
// Deletes a passkey (ownership-checked). Audits the deletion.

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  json,
  errorJson,
  handleError,
  requireUser,
  audit,
  getClientIp,
  getUserAgent,
} from "@/lib/api";
import { logSecurityEvent } from "@/lib/security-log";

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;

    const passkey = await db.passkey.findUnique({ where: { id } });
    if (!passkey || passkey.userId !== user.id) {
      return errorJson("Passkey not found", 404, "NOT_FOUND");
    }

    await db.passkey.delete({ where: { id } });

    await audit({
      userId: user.id,
      action: "PASSKEY_DELETED",
      category: "AUTH",
      severity: "WARN",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { passkeyId: id, deviceName: passkey.deviceName ?? null },
    });
    await logSecurityEvent({
      userId: user.id,
      type: "PASSKEY_DELETED",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { passkeyId: id, deviceName: passkey.deviceName ?? null },
    });

    return json({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
