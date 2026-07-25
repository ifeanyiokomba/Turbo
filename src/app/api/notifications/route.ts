import { db } from "@/lib/db";
import { json, handleError, requireUser } from "@/lib/api";

export async function GET() {
  try {
    const user = await requireUser();
    const notifications = await db.inAppNotification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    const unread = notifications.filter((n) => !n.read).length;
    return json({ notifications, unread });
  } catch (e) {
    return handleError(e);
  }
}

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
