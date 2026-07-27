// TurboCore — TEB Dead Letter Queue API
//
// POST /api/admin/event-bus/dlq
//   { action: "replay", entryId } — replay a dead-lettered event
//   { action: "purge", entryId } — remove a dead-lettered event
//   { action: "purgeAll" } — clear the entire DLQ

import { json, handleError, audit, getClientIp } from "@/lib/api";
import { requirePermission } from "@/lib/turbocore/rbac";
import { Permissions } from "@/lib/turbocore/rbac/permissions";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requirePermission(Permissions.PROVIDERS_MANAGE);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");

    const { eventBus } = await import("@/lib/turbocore/teb/event-bus");

    let result: { success: boolean; message: string };

    if (action === "replay") {
      const entryId = String(body.entryId ?? "");
      if (!entryId) return json({ error: "entryId is required" }, 400);
      const ok = eventBus.replayDeadLetter(entryId);
      result = ok
        ? { success: true, message: "Dead-lettered event re-queued for replay" }
        : { success: false, message: "DLQ entry not found" };
    } else if (action === "purge") {
      const entryId = String(body.entryId ?? "");
      if (!entryId) return json({ error: "entryId is required" }, 400);
      const ok = eventBus.purgeDeadLetter(entryId);
      result = ok
        ? { success: true, message: "DLQ entry purged" }
        : { success: false, message: "DLQ entry not found" };
    } else if (action === "purgeAll") {
      const dlq = eventBus.listDeadLetters(1000);
      for (const entry of dlq) {
        eventBus.purgeDeadLetter(entry.id);
      }
      result = { success: true, message: `${dlq.length} entries purged` };
    } else {
      return json({ error: "Invalid action. Use: replay, purge, or purgeAll" }, 400);
    }

    await audit({
      userId: user.id,
      action: "DLQ_MANAGEMENT",
      category: "ADMIN",
      ip: getClientIp(req),
      metadata: { action, entryId: body.entryId, success: result.success },
    });

    return json(result);
  } catch (e) {
    return handleError(e);
  }
}
