// TurboCore — TEB Event Bus API (Chapter 9)
//
// GET /api/admin/event-bus
//   Returns: event registry, streams, subscribers, monitoring stats, recent events.

import { json, handleError } from "@/lib/api";
import { requirePermission } from "@/lib/turbocore/rbac";
import { Permissions } from "@/lib/turbocore/rbac/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requirePermission(Permissions.CAPABILITIES_VIEW);

    const { EVENT_REGISTRY, getRegistryStats } = await import("@/lib/turbocore/teb/event-registry");
    const { eventBus, EVENT_STREAMS } = await import("@/lib/turbocore/teb/event-bus");

    const monitoring = eventBus.getMonitoringStats();
    const stats = getRegistryStats();

    return json({
      registry: {
        totalEvents: stats.totalEvents,
        byCategory: stats.byCategory,
        byStream: stats.byStream,
        byPriority: stats.byPriority,
        byClassification: stats.byClassification,
        totalConsumers: stats.totalConsumers,
        totalProducers: stats.totalProducers,
        contracts: EVENT_REGISTRY.map((e) => ({
          eventType: e.eventType,
          name: e.name,
          category: e.category,
          stream: e.stream,
          priority: e.priority,
          classification: e.classification,
          owner: e.owner,
          producer: e.producer,
          consumers: e.consumers,
          version: e.version,
          ordered: e.ordered,
          retention: e.retention,
        })),
      },
      streams: EVENT_STREAMS,
      subscribers: eventBus.listSubscribers().map((s) => ({
        id: s.id,
        name: s.name,
        stream: s.stream,
        eventTypes: s.eventTypes,
        priority: s.priority,
        maxRetries: s.maxRetries,
      })),
      monitoring,
      recentEvents: eventBus.getRecentEvents(20),
      deadLetters: eventBus.listDeadLetters(20),
    });
  } catch (e) {
    return handleError(e);
  }
}
