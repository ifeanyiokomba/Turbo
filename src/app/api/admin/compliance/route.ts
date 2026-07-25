// Turbopay admin — compliance dashboard
//
// GET: list open ComplianceCase rows + recent ScreeningResult (last 50) +
//      SanctionsEntry count + recent AmlFlag rows (last 20) for context.
//      Supports optional `?status=` filter on cases.

import { db } from "@/lib/db";
import { json, handleError, requireAdmin } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const statusParam = url.searchParams.get("status")?.trim().toUpperCase();

    const [cases, screenings, sanctionsCount, sanctionsByList, amlFlags] = await Promise.all([
      db.complianceCase.findMany({
        where: statusParam ? { status: statusParam } : { status: { not: "CLOSED" } },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          user: { select: { fullName: true, username: true, email: true } },
        },
      }),
      db.screeningResult.findMany({
        orderBy: { screenedAt: "desc" },
        take: 50,
        include: { user: { select: { fullName: true, username: true } } },
      }),
      db.sanctionsEntry.count(),
      db.sanctionsEntry.groupBy({
        by: ["listName"],
        _count: { _all: true },
      }),
      db.amlFlag.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { user: { select: { fullName: true, username: true } } },
      }),
    ]);

    return json({
      cases: cases.map((c) => ({
        id: c.id,
        type: c.type,
        status: c.status,
        assignedTo: c.assignedTo,
        summary: c.summary,
        metadataJSON: c.metadataJSON,
        createdAt: c.createdAt,
        closedAt: c.closedAt,
        userId: c.userId,
        transactionId: c.transactionId,
        user: c.user
          ? {
              fullName: c.user.fullName,
              username: c.user.username,
              email: c.user.email,
            }
          : null,
      })),
      screenings: screenings.map((s) => ({
        id: s.id,
        entityType: s.entityType,
        entityName: s.entityName,
        hit: s.hit,
        score: s.score,
        matchedEntryId: s.matchedEntryId,
        transactionId: s.transactionId,
        userId: s.userId,
        screenedAt: s.screenedAt,
        userName: s.user?.fullName ?? null,
        userUsername: s.user?.username ?? null,
      })),
      sanctionsCount,
      sanctionsByList: sanctionsByList.map((s) => ({ listName: s.listName, count: s._count._all })),
      amlFlags: amlFlags.map((f) => ({
        id: f.id,
        rule: f.rule,
        severity: f.severity,
        description: f.description,
        resolved: f.resolved,
        createdAt: f.createdAt,
        userId: f.userId,
        userName: f.user?.fullName ?? null,
        userUsername: f.user?.username ?? null,
      })),
    });
  } catch (e) {
    return handleError(e);
  }
}
