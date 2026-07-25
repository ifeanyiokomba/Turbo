import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, handleError, requireUser } from "@/lib/api";

/**
 * GET /api/notifications?filter=all|unread|important
 * Returns the user's notifications, sorted IMPORTANT-first then by date desc.
 * - all       → every notification
 * - unread    → only unread
 * - important → only HIGH priority
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const filterRaw = req.nextUrl.searchParams.get("filter") ?? "all";
    const filter =
      filterRaw === "unread" || filterRaw === "important" ? filterRaw : "all";

    const where =
      filter === "unread"
        ? { userId: user.id, read: false }
        : filter === "important"
          ? { userId: user.id, priority: "HIGH" }
          : { userId: user.id };

    // Fetch a generous slice, then sort in JS so we can put IMPORTANT first
    // while preserving recency within each priority bucket.
    const rows = await db.inAppNotification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const priorityRank: Record<string, number> = { HIGH: 0, NORMAL: 1, LOW: 2 };
    const sorted = [...rows].sort((a, b) => {
      const ra = priorityRank[a.priority] ?? 1;
      const rb = priorityRank[b.priority] ?? 1;
      if (ra !== rb) return ra - rb;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    // Unread count is always computed against the user's full set (regardless of filter)
    // so the bell badge stays consistent.
    const unreadCount = await db.inAppNotification.count({
      where: { userId: user.id, read: false },
    });

    return json({
      notifications: sorted,
      unread: unreadCount,
      filter,
    });
  } catch (e) {
    return handleError(e);
  }
}

/**
 * PATCH /api/notifications
 * Marks ALL of the user's unread notifications as read.
 */
export async function PATCH() {
  try {
    const user = await requireUser();
    await db.inAppNotification.updateMany({
      where: { userId: user.id, read: false },
      data: { read: true },
    });
    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
