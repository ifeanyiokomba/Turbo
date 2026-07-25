import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, handleError, requireUser, getClientIp, getUserAgent } from "@/lib/api";
import { getSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const ip = getClientIp(req);
    const ua = getUserAgent(req);

    const currentSession = await getSession();

    const [sessions, events] = await Promise.all([
      db.session.findMany({
        where: {
          userId: user.id,
          revokedAt: null,
          expiresAt: { gte: new Date() },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      db.auditLog.findMany({
        where: {
          userId: user.id,
          category: { in: ["AUTH", "KYC", "AML"] },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

    const serializedSessions = sessions.map((s) => ({
      id: s.id,
      userAgent: s.userAgent,
      ip: s.ip,
      createdAt: s.createdAt,
      isCurrent: currentSession?.id === s.id,
    }));

    const checklist = {
      hasPin: !!user.transactionPinHash,
      emailVerified: user.emailVerified,
      kycVerified: user.kycStatus === "VERIFIED",
    };

    return json({
      sessions: serializedSessions,
      events,
      checklist,
      ip,
      userAgent: ua,
    });
  } catch (e) {
    return handleError(e);
  }
}
