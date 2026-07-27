// Turbopay admin — compliance dashboard
//
// GET: list open ComplianceCase rows + recent ScreeningResult (last 50) +
//      SanctionsEntry count + recent AmlFlag rows (last 20) for context.
//      Supports optional `?status=` filter on cases.

import { db } from "@/lib/db";
import { json, handleError } from "@/lib/api";
import { requirePermission } from "@/lib/turbocore/rbac";
import { Permissions } from "@/lib/turbocore/rbac/permissions";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requirePermission(Permissions.COMPLIANCE_VIEW);
    const url = new URL(req.url);
    const statusParam = url.searchParams.get("status")?.trim().toUpperCase();

    const [cases, screenings, sanctionsCount, sanctionsByList, amlFlags] = await Promise.all([
      db.complianceCase.findMany({
        where: statusParam ? { status: statusParam } : { status: { not: "CLOSED" } },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      db.screeningResult.findMany({
        orderBy: { screenedAt: "desc" },
        take: 50,
      }),
      db.sanctionsEntry.count(),
      db.sanctionsEntry.groupBy({
        by: ["listName"],
        _count: { _all: true },
      }),
      db.amlFlag.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          user: { select: { fullName: true, username: true } },
        },
      }),
    ]);

    // ComplianceCase and ScreeningResult have no Prisma relation to User — fetch user
    // metadata separately and join in JS so the UI can show names alongside IDs.
    const userIds = new Set<string>();
    for (const c of cases) if (c.userId) userIds.add(c.userId);
    for (const s of screenings) if (s.userId) userIds.add(s.userId);
    const users = await db.user.findMany({
      where: { id: { in: Array.from(userIds) } },
      select: { id: true, fullName: true, username: true, email: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    return json({
      cases: cases.map((c) => {
        const u = c.userId ? userMap.get(c.userId) : null;
        return {
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
          user: u ? { fullName: u.fullName, username: u.username, email: u.email } : null,
        };
      }),
      screenings: screenings.map((s) => {
        const u = s.userId ? userMap.get(s.userId) : null;
        return {
          id: s.id,
          entityType: s.entityType,
          entityName: s.entityName,
          hit: s.hit,
          score: s.score,
          matchedEntryId: s.matchedEntryId,
          transactionId: s.transactionId,
          userId: s.userId,
          screenedAt: s.screenedAt,
          userName: u?.fullName ?? null,
          userUsername: u?.username ?? null,
        };
      }),
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
