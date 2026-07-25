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
  ServiceError,
} from "@/lib/api";

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const session = await db.session.findUnique({ where: { id } });
    if (!session) return errorJson("Session not found", 404, "NOT_FOUND");
    if (session.userId !== user.id) {
      throw new ServiceError("Session does not belong to user", 403, "FORBIDDEN");
    }
    if (session.revokedAt) {
      return json({ ok: true, alreadyRevoked: true });
    }
    await db.session.update({ where: { id }, data: { revokedAt: new Date() } });
    await audit({
      userId: user.id,
      action: "SESSION_REVOKED",
      category: "AUTH",
      severity: "WARN",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { sessionId: id },
    });
    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
