// TurboCore — TEB Event Replay API
//
// POST /api/admin/event-bus/replay
//   { events: TebEvent[], subscriberId? }
//   Replays events through the event bus — rebuilds read models from the event store.

import { json, handleError, audit, getClientIp } from "@/lib/api";
import { requirePermission } from "@/lib/turbocore/rbac";
import { Permissions } from "@/lib/turbocore/rbac/permissions";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requirePermission(Permissions.PROVIDERS_MANAGE);
    const body = await req.json().catch(() => ({}));
    const events = body.events ?? [];
    const subscriberId = body.subscriberId ?? undefined;

    if (!Array.isArray(events) || events.length === 0) {
      return json({ error: "events array is required" }, 400);
    }

    const { eventBus } = await import("@/lib/turbocore/teb/event-bus");

    const result = await eventBus.replayEvents(events, subscriberId);

    await audit({
      userId: user.id,
      action: "EVENT_REPLAY",
      category: "ADMIN",
      severity: "WARN",
      ip: getClientIp(req),
      metadata: {
        eventsCount: events.length,
        replayed: result.replayed,
        skipped: result.skipped,
        failed: result.failed,
        subscriberId,
      },
    });

    return json({
      success: true,
      ...result,
      message: `Replayed ${result.replayed} events (${result.skipped} skipped as duplicates, ${result.failed} failed)`,
    });
  } catch (e) {
    return handleError(e);
  }
}
