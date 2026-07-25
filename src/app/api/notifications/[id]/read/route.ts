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

/**
 * PATCH /api/notifications/[id]/read
 * Marks a single in-app notification as read (owner-scoped).
 */
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    if (!id) return errorJson("Notification id is required", 400, "MISSING_ID");

    const existing = await db.inAppNotification.findUnique({ where: { id } });
    if (!existing) return errorJson("Notification not found", 404, "NOT_FOUND");
    if (existing.userId !== user.id) {
      throw new ServiceError("Forbidden", 403, "FORBIDDEN");
    }

    const updated = await db.inAppNotification.update({
      where: { id },
      data: { read: true },
    });

    await audit({
      userId: user.id,
      action: "NOTIFICATION_READ",
      category: "NOTIFICATION",
      severity: "INFO",
      ip: getClientIp(_req),
      userAgent: getUserAgent(_req),
      metadata: { notificationId: id, type: existing.type },
    });

    return json({ notification: updated });
  } catch (e) {
    if (e instanceof ServiceError) return errorJson(e.message, e.statusCode, e.code);
    return handleError(e);
  }
}
