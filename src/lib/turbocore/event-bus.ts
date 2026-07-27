// TurboCore Event Bus
//
// Everything should be event-driven. No service should call every other service directly.
//
// Example flow:
//   Payment Created → Event Bus → Routing Service → Provider Plugin
//   → Payment Completed → Event Bus → Ledger → Notification → Analytics → Settlement
//
// This is a simple in-memory event bus (modular monolith approach).
// In production, this would be backed by Kafka/NATS, but the interface stays the same.

export type EventHandler<T = any> = (event: TurboCoreEvent<T>) => void | Promise<void>;

export interface TurboCoreEvent<T = any> {
  id: string;
  type: string;
  aggregateType: string; // PAYMENT | WALLET | TRANSFER | KYC | etc.
  aggregateId: string;
  payload: T;
  metadata?: Record<string, unknown>;
  timestamp: string;
  source: string; // which service emitted this
}

class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();

  subscribe(eventType: string, handler: EventHandler): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.handlers.get(eventType)?.delete(handler);
    };
  }

  subscribeAll(handler: EventHandler): () => void {
    return this.subscribe("*", handler);
  }

  async publish<T>(event: Omit<TurboCoreEvent<T>, "id" | "timestamp">): Promise<void> {
    const fullEvent: TurboCoreEvent<T> = {
      ...event,
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
    };

    // Notify specific handlers
    const specificHandlers = this.handlers.get(event.type);
    if (specificHandlers) {
      await Promise.all(
        Array.from(specificHandlers).map(async (handler) => {
          try {
            await handler(fullEvent);
          } catch (e) {
            console.error(`[event-bus] Handler error for ${event.type}:`, e);
          }
        })
      );
    }

    // Notify wildcard handlers
    const wildcardHandlers = this.handlers.get("*");
    if (wildcardHandlers) {
      await Promise.all(
        Array.from(wildcardHandlers).map(async (handler) => {
          try {
            await handler(fullEvent);
          } catch (e) {
            console.error(`[event-bus] Wildcard handler error:`, e);
          }
        })
      );
    }

    // Also persist to OutboxEvent for reliable webhook dispatch
    // (the outbox publisher cron will pick this up)
    try {
      const { db } = await import("@/lib/db");
      await db.outboxEvent.create({
        data: {
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          type: event.type,
          payloadJSON: JSON.stringify(event.payload),
          headersJSON: JSON.stringify(event.metadata ?? {}),
          status: "PENDING",
        },
      });
    } catch {
      // Non-fatal — in-memory event already dispatched
    }
  }

  getSubscribedTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  getHandlerCount(eventType: string): number {
    return this.handlers.get(eventType)?.size ?? 0;
  }
}

// Singleton instance
export const eventBus = new EventBus();

// ===== Event Type Constants =====
// These match the TurboCoreEventType from models/index.ts

export const EventTypes = {
  PAYMENT_CREATED: "PAYMENT.CREATED",
  PAYMENT_PENDING: "PAYMENT.PENDING",
  PAYMENT_PROCESSING: "PAYMENT.PROCESSING",
  PAYMENT_AUTHORIZED: "PAYMENT.AUTHORIZED",
  PAYMENT_COMPLETED: "PAYMENT.COMPLETED",
  PAYMENT_FAILED: "PAYMENT.FAILED",
  PAYMENT_CANCELLED: "PAYMENT.CANCELLED",
  PAYMENT_EXPIRED: "PAYMENT.EXPIRED",
  PAYMENT_REVERSED: "PAYMENT.REVERSED",
  PAYMENT_REFUNDED: "PAYMENT.REFUNDED",
  PAYMENT_DISPUTED: "PAYMENT.DISPUTED",
  TRANSFER_CREATED: "TRANSFER.CREATED",
  TRANSFER_COMPLETED: "TRANSFER.COMPLETED",
  TRANSFER_FAILED: "TRANSFER.FAILED",
  KYC_APPROVED: "KYC.APPROVED",
  KYC_REJECTED: "KYC.REJECTED",
  KYC_PENDING: "KYC.PENDING",
  SETTLEMENT_COMPLETED: "SETTLEMENT.COMPLETED",
  SETTLEMENT_PENDING: "SETTLEMENT.PENDING",
  PROVIDER_DOWN: "PROVIDER.DOWN",
  PROVIDER_DEGRADED: "PROVIDER.DEGRADED",
  PROVIDER_RECOVERED: "PROVIDER.RECOVERED",
  WALLET_FUNDED: "WALLET.FUNDED",
  WALLET_DEBITED: "WALLET.DEBITED",
  WALLET_FROZEN: "WALLET.FROZEN",
  RISK_FLAGGED: "RISK.FLAGGED",
  RISK_BLOCKED: "RISK.BLOCKED",
  WEBHOOK_RECEIVED: "WEBHOOK.RECEIVED",
  WEBHOOK_PROCESSED: "WEBHOOK.PROCESSED",
} as const;

// ===== Helper: Publish a payment event =====

export async function publishPaymentEvent(
  type: string,
  paymentId: string,
  payload: Record<string, unknown>,
  source = "orchestrator"
): Promise<void> {
  await eventBus.publish({
    type,
    aggregateType: "PAYMENT",
    aggregateId: paymentId,
    payload,
    source,
  });
}

// ===== Helper: Publish a provider event =====

export async function publishProviderEvent(
  type: string,
  providerCode: string,
  payload: Record<string, unknown>,
  source = "health-monitor"
): Promise<void> {
  await eventBus.publish({
    type,
    aggregateType: "PROVIDER",
    aggregateId: providerCode,
    payload,
    source,
  });
}

// ===== Helper: Publish a wallet event =====

export async function publishWalletEvent(
  type: string,
  walletId: string,
  payload: Record<string, unknown>,
  source = "wallet-service"
): Promise<void> {
  await eventBus.publish({
    type,
    aggregateType: "WALLET",
    aggregateId: walletId,
    payload,
    source,
  });
}
