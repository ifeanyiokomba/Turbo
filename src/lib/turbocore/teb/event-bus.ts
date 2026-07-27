// TurboCore — TEB Event Bus (Chapter 9)
//
// The nervous system of TurboPay. Every service communicates through events.
// Nothing talks directly unless absolutely necessary.
//
// Features:
//   - Event publishing with correlation + causation IDs
//   - Event streams (separate queues per domain)
//   - Subscriber registration + event routing
//   - Retry with exponential backoff (1min → 5min → 15min → 1hour)
//   - Dead Letter Queue for exhausted retries
//   - Event replay (rebuild read models from the event store)
//   - Inbox pattern (idempotent consumers)
//   - Event monitoring (events/sec, queue length, consumer lag)
//
// Architecture:
//   Producer → Event Bus → Stream → Subscriber → (retry on failure) → DLQ
//                            ↓
//                       Event Store (immutable, replayable)

import { generateId } from "@/lib/turbocore/database/ids";
import { getEventContract } from "./event-registry";
import {
  type TebEvent,
  type EventStream,
  type EventPriority,
  type EventStatus,
  type RetryInfo,
  RETRY_BACKOFF_MS,
  MAX_RETRY_ATTEMPTS,
  calculateNextRetry,
  getRetryInfo,
} from "./types";

// ---------------------------------------------------------------------------
// Subscriber type
// ---------------------------------------------------------------------------

export type EventHandler<T = unknown> = (event: TebEvent<T>) => Promise<void>;

export interface Subscriber {
  id: string;
  name: string;
  stream: EventStream | "*";
  eventTypes: string[] | "*"; // "*" = all events in the stream
  handler: EventHandler;
  priority: EventPriority;
  maxRetries: number;
}

// ---------------------------------------------------------------------------
// In-flight event (queued for processing)
// ---------------------------------------------------------------------------

interface QueuedEvent {
  event: TebEvent;
  subscriberId: string;
  attempts: number;
  nextRetryAt: string | null;
  lastError: string | null;
  status: EventStatus;
  queuedAt: string;
}

// ---------------------------------------------------------------------------
// Inbox (idempotent consumer tracking)
// ---------------------------------------------------------------------------

interface InboxEntry {
  eventId: string;
  subscriberId: string;
  processedAt: string;
}

// ---------------------------------------------------------------------------
// Dead Letter Queue entry
// ---------------------------------------------------------------------------

export interface DeadLetterEntry {
  id: string;
  event: TebEvent;
  subscriberId: string;
  subscriberName: string;
  attempts: number;
  lastError: string;
  deadLetteredAt: string;
  originalEventId: string;
}

// ---------------------------------------------------------------------------
// Event Bus class
// ---------------------------------------------------------------------------

class TurboEventBus {
  private subscribers = new Map<string, Subscriber>();
  private queue: QueuedEvent[] = [];
  private inbox: InboxEntry[] = [];
  private deadLetters: DeadLetterEntry[] = [];
  private processing = false;
  private processedCount = 0;
  private failedCount = 0;
  private publishedCount = 0;

  // Monitoring stats
  private eventsPerSecond: number[] = []; // rolling window
  private lastEvents: TebEvent[] = []; // recent events for admin UI

  // ---------------------------------------------------------------------------
  // Subscriber registration
  // ---------------------------------------------------------------------------

  subscribe(config: {
    name: string;
    stream: EventStream | "*";
    eventTypes?: string[] | "*";
    handler: EventHandler;
    priority?: EventPriority;
    maxRetries?: number;
  }): string {
    const id = generateId("EVENT_STORE");
    const subscriber: Subscriber = {
      id,
      name: config.name,
      stream: config.stream,
      eventTypes: config.eventTypes ?? "*",
      handler: config.handler,
      priority: config.priority ?? "MEDIUM",
      maxRetries: config.maxRetries ?? MAX_RETRY_ATTEMPTS,
    };
    this.subscribers.set(id, subscriber);
    return id;
  }

  unsubscribe(id: string): boolean {
    return this.subscribers.delete(id);
  }

  listSubscribers(): Subscriber[] {
    return Array.from(this.subscribers.values());
  }

  // ---------------------------------------------------------------------------
  // Event publishing
  // ---------------------------------------------------------------------------

  async publish<T>(config: {
    eventType: string;
    aggregateId: string;
    aggregateType: string;
    payload: T;
    source: string;
    actor?: string;
    country?: string | null;
    correlationId?: string;
    causationId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<TebEvent<T>> {
    const contract = getEventContract(config.eventType);

    const event: TebEvent<T> = {
      eventId: generateId("EVENT_STORE"),
      eventType: config.eventType,
      aggregateId: config.aggregateId,
      aggregateType: config.aggregateType,
      correlationId: config.correlationId ?? generateId("EVENT_STORE"),
      causationId: config.causationId ?? null,
      version: contract?.version ?? "v1",
      timestamp: new Date().toISOString(),
      source: config.source,
      actor: config.actor ?? "SYSTEM",
      country: config.country ?? null,
      payload: config.payload,
      metadata: config.metadata ?? {},
      stream: contract?.stream ?? "system",
      category: contract?.category ?? "SYSTEM",
      priority: contract?.priority ?? "MEDIUM",
      classification: contract?.classification ?? "INTERNAL",
      checksum: this.computeChecksum(config.payload),
      encrypted: false,
      aggregateVersion: 1,
    };

    this.publishedCount++;
    this.recordEventForMonitoring(event);

    // Route to subscribers
    const matchingSubscribers = this.getMatchingSubscribers(event);
    for (const sub of matchingSubscribers) {
      this.queue.push({
        event,
        subscriberId: sub.id,
        attempts: 0,
        nextRetryAt: new Date().toISOString(),
        lastError: null,
        status: "PENDING",
        queuedAt: new Date().toISOString(),
      });
    }

    // Start processing if not already running
    if (!this.processing) {
      this.processQueue().catch(() => {});
    }

    return event;
  }

  // ---------------------------------------------------------------------------
  // Queue processing
  // ---------------------------------------------------------------------------

  private async processQueue(): Promise<void> {
    this.processing = true;
    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      if (item.status === "DEAD_LETTER") continue;

      // Check if it's time to retry
      if (item.nextRetryAt && new Date(item.nextRetryAt) > new Date()) {
        // Re-queue for later
        this.queue.push(item);
        continue;
      }

      const subscriber = this.subscribers.get(item.subscriberId);
      if (!subscriber) {
        item.status = "FAILED";
        this.failedCount++;
        continue;
      }

      // Inbox check — idempotency
      const inboxKey = `${item.event.eventId}:${subscriber.id}`;
      if (this.inbox.some((e) => `${e.eventId}:${e.subscriberId}` === inboxKey)) {
        // Already processed — skip
        item.status = "PUBLISHED";
        continue;
      }

      try {
        await subscriber.handler(item.event);
        // Success — mark as processed in inbox
        this.inbox.push({
          eventId: item.event.eventId,
          subscriberId: subscriber.id,
          processedAt: new Date().toISOString(),
        });
        item.status = "PUBLISHED";
        this.processedCount++;
      } catch (e) {
        item.attempts++;
        item.lastError = (e as Error).message;
        const retryInfo = getRetryInfo(item.attempts, item.lastError);
        if (retryInfo.exhausted || item.attempts >= subscriber.maxRetries) {
          // Dead letter
          item.status = "DEAD_LETTER";
          this.deadLetters.push({
            id: generateId("EVENT_STORE"),
            event: item.event,
            subscriberId: subscriber.id,
            subscriberName: subscriber.name,
            attempts: item.attempts,
            lastError: item.lastError,
            deadLetteredAt: new Date().toISOString(),
            originalEventId: item.event.eventId,
          });
          this.failedCount++;
        } else {
          // Schedule retry
          item.nextRetryAt = retryInfo.nextRetryAt;
          item.status = "PENDING";
          this.queue.push(item);
        }
      }
    }
    this.processing = false;
  }

  // ---------------------------------------------------------------------------
  // Event replay (Chapter 9)
  // ---------------------------------------------------------------------------

  async replayEvents(
    events: TebEvent[],
    subscriberId?: string
  ): Promise<{ replayed: number; skipped: number; failed: number }> {
    let replayed = 0;
    let skipped = 0;
    let failed = 0;

    for (const event of events) {
      const matchingSubs = subscriberId
        ? ([this.subscribers.get(subscriberId)].filter(Boolean) as Subscriber[])
        : this.getMatchingSubscribers(event);

      for (const sub of matchingSubs) {
        // Inbox check — skip if already processed
        const inboxKey = `${event.eventId}:${sub.id}`;
        if (this.inbox.some((e) => `${e.eventId}:${e.subscriberId}` === inboxKey)) {
          skipped++;
          continue;
        }

        try {
          await sub.handler(event);
          this.inbox.push({
            eventId: event.eventId,
            subscriberId: sub.id,
            processedAt: new Date().toISOString(),
          });
          replayed++;
        } catch {
          failed++;
        }
      }
    }

    return { replayed, skipped, failed };
  }

  // ---------------------------------------------------------------------------
  // DLQ management
  // ---------------------------------------------------------------------------

  listDeadLetters(limit = 50): DeadLetterEntry[] {
    return this.deadLetters.slice(-limit).reverse();
  }

  replayDeadLetter(entryId: string): boolean {
    const idx = this.deadLetters.findIndex((d) => d.id === entryId);
    if (idx === -1) return false;
    const entry = this.deadLetters[idx];
    // Re-queue the event
    this.queue.push({
      event: entry.event,
      subscriberId: entry.subscriberId,
      attempts: 0,
      nextRetryAt: new Date().toISOString(),
      lastError: null,
      status: "PENDING",
      queuedAt: new Date().toISOString(),
    });
    this.deadLetters.splice(idx, 1);
    if (!this.processing) {
      this.processQueue().catch(() => {});
    }
    return true;
  }

  purgeDeadLetter(entryId: string): boolean {
    const idx = this.deadLetters.findIndex((d) => d.id === entryId);
    if (idx === -1) return false;
    this.deadLetters.splice(idx, 1);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Inbox management (idempotency)
  // ---------------------------------------------------------------------------

  isInboxProcessed(eventId: string, subscriberId: string): boolean {
    return this.inbox.some((e) => e.eventId === eventId && e.subscriberId === subscriberId);
  }

  getInboxSize(): number {
    return this.inbox.length;
  }

  clearInbox(): void {
    this.inbox = [];
  }

  // ---------------------------------------------------------------------------
  // Monitoring (Chapter 9)
  // ---------------------------------------------------------------------------

  getMonitoringStats() {
    const queueByStream: Record<string, number> = {};
    for (const item of this.queue) {
      const stream = item.event.stream;
      queueByStream[stream] = (queueByStream[stream] ?? 0) + 1;
    }

    return {
      published: this.publishedCount,
      processed: this.processedCount,
      failed: this.failedCount,
      queueLength: this.queue.length,
      deadLetterCount: this.deadLetters.length,
      inboxSize: this.inbox.length,
      subscriberCount: this.subscribers.size,
      eventsPerSecond: this.eventsPerSecond.slice(-60), // last 60 samples
      queueByStream,
      recentEvents: this.lastEvents.slice(-20).reverse(),
    };
  }

  getRecentEvents(limit = 50): TebEvent[] {
    return this.lastEvents.slice(-limit).reverse();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private getMatchingSubscribers(event: TebEvent): Subscriber[] {
    return Array.from(this.subscribers.values()).filter((sub) => {
      if (sub.stream !== "*" && sub.stream !== event.stream) return false;
      if (sub.eventTypes !== "*" && !sub.eventTypes.includes(event.eventType)) return false;
      return true;
    });
  }

  private computeChecksum(payload: unknown): string {
    const str = JSON.stringify(payload);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  private recordEventForMonitoring(event: TebEvent): void {
    this.lastEvents.push(event);
    if (this.lastEvents.length > 200) {
      this.lastEvents = this.lastEvents.slice(-200);
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const eventBus = new TurboEventBus();

// ---------------------------------------------------------------------------
// Stream definitions (Chapter 9 — separate queues)
// ---------------------------------------------------------------------------

export const EVENT_STREAMS: Array<{
  id: EventStream;
  name: string;
  description: string;
  orderingRequired: boolean;
}> = [
  {
    id: "payments",
    name: "Payments Stream",
    description: "Payment lifecycle events.",
    orderingRequired: true,
  },
  {
    id: "wallets",
    name: "Wallets Stream",
    description: "Wallet funding, withdrawal, transfer events.",
    orderingRequired: true,
  },
  {
    id: "ledger",
    name: "Ledger Stream",
    description: "Journal entry postings.",
    orderingRequired: true,
  },
  {
    id: "provider",
    name: "Provider Stream",
    description: "Provider health, webhooks, plugin updates.",
    orderingRequired: false,
  },
  {
    id: "compliance",
    name: "Compliance Stream",
    description: "KYC, AML, sanctions events.",
    orderingRequired: false,
  },
  {
    id: "merchant",
    name: "Merchant Stream",
    description: "Merchant lifecycle + invoice events.",
    orderingRequired: false,
  },
  {
    id: "analytics",
    name: "Analytics Stream",
    description: "Pre-computed analytics projections.",
    orderingRequired: false,
  },
  {
    id: "security",
    name: "Security Stream",
    description: "Login, device, token events.",
    orderingRequired: false,
  },
  {
    id: "system",
    name: "System Stream",
    description: "FX updates, config changes.",
    orderingRequired: false,
  },
];
