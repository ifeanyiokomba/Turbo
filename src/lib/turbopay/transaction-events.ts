// TurboPay Transaction Event Engine — immutable event sourcing
//
// Everything becomes an immutable event. Never update transactions.
// Append events.
//
// Transaction lifecycle:
//   CREATED → AUTHORIZED → PROCESSING → SETTLED → COMPLETED
//                                    ↘ FAILED
//                         ↘ REVERSED
//                         ↘ REFUNDED
//
// Each transition appends a TransactionEvent record.
// The Transaction.status field is a projection of the latest event.

import { db } from "@/lib/db";
import { audit } from "@/lib/api";

export type TransactionEventType =
  | "CREATED"
  | "AUTHORIZED"
  | "PROCESSING"
  | "SETTLED"
  | "COMPLETED"
  | "FAILED"
  | "REVERSED"
  | "REFUNDED";

export type TransactionEventStatus = "PENDING" | "SUCCESS" | "FAILED";

export interface AppendEventOptions {
  transactionId: string;
  eventType: TransactionEventType;
  status?: TransactionEventStatus;
  actor?: string;
  actorId?: string;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Append an immutable event to a transaction's event log.
 * Also updates the transaction's status to reflect the new state.
 * Never updates an existing event — only appends.
 */
export async function appendEvent(
  opts: AppendEventOptions
): Promise<{ event: any; transaction: any }> {
  const status = opts.status ?? "SUCCESS";
  const actor = opts.actor ?? "SYSTEM";

  // 1. Append the event (immutable)
  const event = await db.transactionEvent.create({
    data: {
      transactionId: opts.transactionId,
      eventType: opts.eventType,
      status,
      actor,
      actorId: opts.actorId ?? null,
      payload: JSON.stringify(opts.payload ?? {}),
      metadata: JSON.stringify(opts.metadata ?? {}),
    },
  });

  // 2. Project the new status onto the Transaction (read model)
  const statusMap: Record<TransactionEventType, string> = {
    CREATED: "PENDING",
    AUTHORIZED: "PENDING",
    PROCESSING: "PENDING",
    SETTLED: "SUCCESS",
    COMPLETED: "SUCCESS",
    FAILED: "FAILED",
    REVERSED: "REVERSED",
    REFUNDED: "REVERSED",
  };

  const stateMap: Record<TransactionEventType, string> = {
    CREATED: "INITIATED",
    AUTHORIZED: "PIN_VERIFIED",
    PROCESSING: "HOLD_POSTED",
    SETTLED: "SETTLED",
    COMPLETED: "SETTLED",
    FAILED: "REVERSED",
    REVERSED: "REVERSED",
    REFUNDED: "REVERSED",
  };

  const transaction = await db.transaction.update({
    where: { id: opts.transactionId },
    data: {
      status: statusMap[opts.eventType],
      state: stateMap[opts.eventType],
      updatedAt: new Date(),
    },
  });

  // 3. Audit the state transition
  await audit({
    userId: opts.actorId,
    action: `TX_${opts.eventType}`,
    category: "WALLET",
    metadata: { transactionId: opts.transactionId, eventType: opts.eventType, status },
  });

  return { event, transaction };
}

/**
 * Get the full event timeline for a transaction.
 * Returns events in chronological order — the complete audit trail.
 */
export async function getTransactionTimeline(transactionId: string): Promise<any[]> {
  return db.transactionEvent.findMany({
    where: { transactionId },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Reconstruct a transaction's current state from its event log.
 * This is the event sourcing pattern — the source of truth is the event log,
 * not the Transaction.status field (which is a projection).
 */
export async function reconstructFromEvents(transactionId: string): Promise<{
  currentStatus: string;
  currentState: string;
  events: any[];
  timeline: { type: string; status: string; at: string; actor: string }[];
}> {
  const events = await getTransactionTimeline(transactionId);
  if (events.length === 0) {
    return { currentStatus: "UNKNOWN", currentState: "UNKNOWN", events: [], timeline: [] };
  }

  const lastEvent = events[events.length - 1];
  const statusMap: Record<string, string> = {
    CREATED: "PENDING",
    AUTHORIZED: "PENDING",
    PROCESSING: "PENDING",
    SETTLED: "SUCCESS",
    COMPLETED: "SUCCESS",
    FAILED: "FAILED",
    REVERSED: "REVERSED",
    REFUNDED: "REVERSED",
  };
  const stateMap: Record<string, string> = {
    CREATED: "INITIATED",
    AUTHORIZED: "PIN_VERIFIED",
    PROCESSING: "HOLD_POSTED",
    SETTLED: "SETTLED",
    COMPLETED: "SETTLED",
    FAILED: "REVERSED",
    REVERSED: "REVERSED",
    REFUNDED: "REVERSED",
  };

  return {
    currentStatus: statusMap[lastEvent.eventType] ?? "UNKNOWN",
    currentState: stateMap[lastEvent.eventType] ?? "UNKNOWN",
    events,
    timeline: events.map((e) => ({
      type: e.eventType,
      status: e.status,
      at: e.createdAt.toISOString(),
      actor: e.actor,
    })),
  };
}
