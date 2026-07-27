// Turbopay admin — paginated audit log
//
// GET ?page=&limit=
// Returns the most recent audit entries with the user's fullName attached.
// Default limit is 50 (matching the admin console "last 50" requirement),
// capped at 100 to keep responses reasonable.

import { db } from "@/lib/db";
import { json, handleError } from "@/lib/api";
import { requirePermission } from "@/lib/turbocore/rbac";
import { Permissions } from "@/lib/turbocore/rbac/permissions";

export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

export async function GET(req: Request) {
  try {
    await requirePermission(Permissions.AUDIT_VIEW);
    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
    const limit = Math.min(
      MAX_PAGE_SIZE,
      Math.max(
        1,
        Number(url.searchParams.get("limit") ?? String(DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE
      )
    );
    const category = url.searchParams.get("category")?.trim().toUpperCase() ?? "";
    const severity = url.searchParams.get("severity")?.trim().toUpperCase() ?? "";

    const where: { category?: string; severity?: string } = {};
    if (category) where.category = category;
    if (severity) where.severity = severity;

    const [logs, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: {
            select: { fullName: true, username: true },
          },
        },
      }),
      db.auditLog.count({ where }),
    ]);

    return json({
      logs: logs.map((l) => ({
        id: l.id,
        action: l.action,
        category: l.category,
        severity: l.severity,
        ip: l.ip,
        userAgent: l.userAgent,
        metadata: l.metadata,
        createdAt: l.createdAt,
        userName: l.user?.fullName ?? null,
        userUsername: l.user?.username ?? null,
      })),
      total,
      page,
      limit,
    });
  } catch (e) {
    return handleError(e);
  }
}
