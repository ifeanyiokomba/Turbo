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
import { logSecurityEvent } from "@/lib/security-log";

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

    // Also revoke any matching refresh tokens for this session's user agent / IP
    // (best-effort — won't catch every JWT in flight, but blocks future refreshes).
    try {
      const now = new Date();
      await db.refreshToken.updateMany({
        where: {
          userId: user.id,
          revokedAt: null,
          OR: [{ userAgent: session.userAgent }, { ip: session.ip }],
        },
        data: { revokedAt: now },
      });
    } catch {
      /* best-effort */
    }

    await audit({
      userId: user.id,
      action: "SESSION_REVOKED",
      category: "AUTH",
      severity: "WARN",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { sessionId: id },
    });
    await logSecurityEvent({
      userId: user.id,
      type: "DEVICE_REVOKED",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { sessionId: id, reason: "session-revoke" },
    });
    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
