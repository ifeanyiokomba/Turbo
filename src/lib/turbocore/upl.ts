// TurboCore Universal Payment Lifecycle (UPL) — Chapter 6
//
// Every payment follows exactly the same lifecycle regardless of payment method.
// This module provides:
//   1. UPL State Machine (formal state transitions)
//   2. Missing UPL event types (VALIDATED, ROUTED, INITIATED)
//   3. Correlation ID propagation
//   4. Dead Letter Queue (DLQ) for failed events
//   5. Workflow versioning (versioned payment flows)
//   6. Saga orchestration (compensating actions)
//   7. Timeout management per stage
//   8. Universal timeline builder

import { db } from "@/lib/db";
import { eventBus } from "./event-bus";

// ===== UPL State Machine =====
//
// CREATED → VALIDATED → ROUTED → INITIATED → PROCESSING → AUTHORIZED → COMPLETED
//                                                    ↘ FAILED
//                                              AUTHORIZED → EXPIRED
//                                              COMPLETED → REFUNDED
//                                              COMPLETED → DISPUTED
//                                              COMPLETED → CANCELLED

export type UPLState =
  | "CREATED"
  | "VALIDATED"
  | "ROUTED"
  | "INITIATED"
  | "PROCESSING"
  | "AUTHORIZED"
  | "COMPLETED"
  | "FAILED"
  | "EXPIRED"
  | "REFUNDED"
  | "DISPUTED"
  | "CANCELLED"
  | "REVERSED";

// Valid state transitions (state machine rules)
const VALID_TRANSITIONS: Record<UPLState, UPLState[]> = {
  CREATED: ["VALIDATED", "FAILED", "CANCELLED"],
  VALIDATED: ["ROUTED", "FAILED", "CANCELLED"],
  ROUTED: ["INITIATED", "FAILED", "CANCELLED"],
  INITIATED: ["PROCESSING", "FAILED", "EXPIRED", "CANCELLED"],
  PROCESSING: ["AUTHORIZED", "COMPLETED", "FAILED", "EXPIRED"],
  AUTHORIZED: ["COMPLETED", "FAILED", "EXPIRED"],
  COMPLETED: ["REFUNDED", "DISPUTED", "REVERSED"],
  FAILED: ["REVERSED"],
  EXPIRED: [],
  REFUNDED: [],
  DISPUTED: ["COMPLETED", "REVERSED"],
  CANCELLED: [],
  REVERSED: [],
};

export function canTransition(from: UPLState, to: UPLState): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function getNextStates(current: UPLState): UPLState[] {
  return VALID_TRANSITIONS[current] ?? [];
}

// ===== Missing UPL Event Types =====

export const UPLEventTypes = {
  PAYMENT_CREATED: "PAYMENT.CREATED",
  PAYMENT_VALIDATED: "PAYMENT.VALIDATED",
  PAYMENT_ROUTED: "PAYMENT.ROUTED",
  PAYMENT_INITIATED: "PAYMENT.INITIATED",
  PAYMENT_PROCESSING: "PAYMENT.PROCESSING",
  PAYMENT_AUTHORIZED: "PAYMENT.AUTHORIZED",
  PAYMENT_COMPLETED: "PAYMENT.COMPLETED",
  PAYMENT_FAILED: "PAYMENT.FAILED",
  PAYMENT_EXPIRED: "PAYMENT.EXPIRED",
  PAYMENT_CANCELLED: "PAYMENT.CANCELLED",
  PAYMENT_REFUNDED: "PAYMENT.REFUNDED",
  PAYMENT_DISPUTED: "PAYMENT.DISPUTED",
  PAYMENT_REVERSED: "PAYMENT.REVERSED",
  // Settlement events
  SETTLEMENT_PENDING: "SETTLEMENT.PENDING",
  SETTLEMENT_COMPLETED: "SETTLEMENT.COMPLETED",
  // Lifecycle events
  LEDGER_POSTED: "LEDGER.POSTED",
  WALLET_UPDATED: "WALLET.UPDATED",
  NOTIFICATION_SENT: "NOTIFICATION.SENT",
} as const;

// ===== Correlation ID =====

export class CorrelationContext {
  private static current: string | null = null;

  static set(correlationId: string): void {
    CorrelationContext.current = correlationId;
  }

  static get(): string | null {
    return CorrelationContext.current;
  }

  static generate(): string {
    const id = `corr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    CorrelationContext.set(id);
    return id;
  }

  static clear(): void {
    CorrelationContext.current = null;
  }
}

// ===== Dead Letter Queue (DLQ) =====
//
// Failed events never disappear. They move here.
// A retry worker processes them later.

export interface DLQEntry {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  error: string;
  attempts: number;
  maxAttempts: number;
  nextRetryAt: string;
  createdAt: string;
  lastAttemptAt?: string;
}

const dlq: Map<string, DLQEntry> = new Map();

export function sendToDLQ(opts: {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  error: string;
  maxAttempts?: number;
}): DLQEntry {
  const id = `dlq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const entry: DLQEntry = {
    id,
    eventType: opts.eventType,
    aggregateType: opts.aggregateType,
    aggregateId: opts.aggregateId,
    payload: opts.payload,
    error: opts.error,
    attempts: 0,
    maxAttempts: opts.maxAttempts ?? 5,
    nextRetryAt: new Date(Date.now() + 60_000).toISOString(), // 1 min initial backoff
    createdAt: new Date().toISOString(),
  };
  dlq.set(id, entry);
  return entry;
}

export function getDLQEntries(limit = 50): DLQEntry[] {
  return Array.from(dlq.values())
    .filter((e) => e.attempts < e.maxAttempts)
    .slice(0, limit);
}

export function getDLQEntry(id: string): DLQEntry | null {
  return dlq.get(id) ?? null;
}

export async function retryDLQEntry(id: string): Promise<{ retried: boolean; error?: string }> {
  const entry = dlq.get(id);
  if (!entry) return { retried: false, error: "Not found" };
  if (entry.attempts >= entry.maxAttempts) return { retried: false, error: "Max attempts reached" };

  entry.attempts++;
  entry.lastAttemptAt = new Date().toISOString();

  try {
    await eventBus.publish({
      type: entry.eventType,
      aggregateType: entry.aggregateType,
      aggregateId: entry.aggregateId,
      payload: entry.payload,
      source: "dlq-retry-worker",
    });

    // Success — remove from DLQ
    dlq.delete(id);
    return { retried: true };
  } catch (e) {
    // Failed again — schedule next retry with exponential backoff
    const backoff = Math.pow(2, entry.attempts) * 60_000; // 1min, 2min, 4min, 8min, 16min
    entry.nextRetryAt = new Date(Date.now() + backoff).toISOString();
    return { retried: false, error: e instanceof Error ? e.message : "Retry failed" };
  }
}

export async function processDLQ(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const entries = getDLQEntries(20);
  let succeeded = 0;
  let failed = 0;

  for (const entry of entries) {
    const result = await retryDLQEntry(entry.id);
    if (result.retried) succeeded++;
    else failed++;
  }

  return { processed: entries.length, succeeded, failed };
}

// ===== Workflow Versioning =====
//
// Version payment workflows. Transactions always complete using the version
// they started with, even if a new version is deployed.

export interface PaymentWorkflow {
  version: string;
  stages: WorkflowStage[];
  description: string;
  createdAt: string;
}

export interface WorkflowStage {
  name: string;
  timeout: number; // ms
  retries: number;
  compensatingAction?: string; // saga compensation
}

// Default UPL workflow (v1)
export const UPL_V1: PaymentWorkflow = {
  version: "1.0.0",
  description: "Universal Payment Lifecycle v1",
  createdAt: new Date().toISOString(),
  stages: [
    { name: "validate", timeout: 5_000, retries: 0 },
    { name: "identity", timeout: 10_000, retries: 0 },
    { name: "risk", timeout: 10_000, retries: 0 },
    { name: "route", timeout: 5_000, retries: 0 },
    { name: "initialize", timeout: 30_000, retries: 1, compensatingAction: "release_reservation" },
    { name: "process", timeout: 30_000, retries: 2, compensatingAction: "reverse_hold" },
    {
      name: "await_confirmation",
      timeout: 300_000,
      retries: 0,
      compensatingAction: "reverse_hold",
    },
    { name: "post_ledger", timeout: 10_000, retries: 3 },
    { name: "notify", timeout: 10_000, retries: 3 },
    { name: "reconcile", timeout: 60_000, retries: 1 },
  ],
};

// UPL v2 (future — adds parallel validation)
export const UPL_V2: PaymentWorkflow = {
  version: "2.0.0",
  description: "Universal Payment Lifecycle v2 — parallel validation",
  createdAt: new Date().toISOString(),
  stages: [
    { name: "validate_and_identity", timeout: 10_000, retries: 0 }, // parallel
    { name: "risk", timeout: 10_000, retries: 0 },
    { name: "route", timeout: 5_000, retries: 0 },
    { name: "initialize", timeout: 30_000, retries: 1, compensatingAction: "release_reservation" },
    { name: "process", timeout: 30_000, retries: 2, compensatingAction: "reverse_hold" },
    {
      name: "await_confirmation",
      timeout: 300_000,
      retries: 0,
      compensatingAction: "reverse_hold",
    },
    { name: "post_ledger", timeout: 10_000, retries: 3 },
    { name: "notify", timeout: 10_000, retries: 3 },
    { name: "reconcile", timeout: 60_000, retries: 1 },
  ],
};

const workflows = new Map<string, PaymentWorkflow>();
workflows.set("1.0.0", UPL_V1);
workflows.set("2.0.0", UPL_V2);

export function getWorkflow(version: string): PaymentWorkflow | null {
  return workflows.get(version) ?? null;
}

export function getDefaultWorkflow(): PaymentWorkflow {
  return UPL_V1;
}

export function registerWorkflow(workflow: PaymentWorkflow): void {
  workflows.set(workflow.version, workflow);
}

// ===== Saga Orchestration =====
//
// Never use database transactions across providers.
// Use the Saga Pattern — each step has a compensating action.

export interface SagaStep {
  name: string;
  execute: () => Promise<boolean>;
  compensate: () => Promise<void>;
}

export async function executeSaga(
  steps: SagaStep[]
): Promise<{ success: boolean; completedSteps: string[]; compensatedSteps: string[] }> {
  const completedSteps: string[] = [];
  const compensatedSteps: string[] = [];

  for (const step of steps) {
    try {
      const success = await step.execute();
      if (success) {
        completedSteps.push(step.name);
      } else {
        // Step failed — compensate all completed steps in reverse order
        for (let i = completedSteps.length - 1; i >= 0; i--) {
          const stepName = completedSteps[i];
          const completedStep = steps.find((s) => s.name === stepName);
          if (completedStep) {
            try {
              await completedStep.compensate();
              compensatedSteps.push(stepName);
            } catch (e) {
              console.error(`[saga] Compensation failed for ${stepName}:`, e);
            }
          }
        }
        return { success: false, completedSteps, compensatedSteps };
      }
    } catch (e) {
      // Exception — compensate
      for (let i = completedSteps.length - 1; i >= 0; i--) {
        const stepName = completedSteps[i];
        const completedStep = steps.find((s) => s.name === stepName);
        if (completedStep) {
          try {
            await completedStep.compensate();
            compensatedSteps.push(stepName);
          } catch (compErr) {
            console.error(`[saga] Compensation failed for ${stepName}:`, compErr);
          }
        }
      }
      return { success: false, completedSteps, compensatedSteps };
    }
  }

  return { success: true, completedSteps, compensatedSteps };
}

// ===== Universal Timeline =====
//
// Every payment has a complete timeline visible in admin console.

export interface TimelineEntry {
  timestamp: string;
  stage: string;
  status: string;
  details?: string;
  actor?: string;
  durationMs?: number;
}

export async function buildTimeline(transactionId: string): Promise<TimelineEntry[]> {
  // Gather from PaymentFlowLog + TransactionEvent + AuditLog
  const [flowLogs, events, auditLogs] = await Promise.all([
    db.paymentFlowLog.findMany({ where: { transactionId }, orderBy: { at: "asc" } }),
    db.transactionEvent
      .findMany({ where: { transactionId }, orderBy: { createdAt: "asc" } })
      .catch(() => []),
    db.auditLog
      .findMany({
        where: { metadata: { contains: transactionId } },
        orderBy: { createdAt: "asc" },
        take: 20,
      })
      .catch(() => []),
  ]);

  const timeline: TimelineEntry[] = [];

  // Flow logs (step-by-step trace)
  for (const log of flowLogs) {
    timeline.push({
      timestamp: log.at.toISOString(),
      stage: log.step,
      status: log.status,
      details: log.payloadJSON ? log.payloadJSON.slice(0, 200) : undefined,
      actor: log.providerCode ?? undefined,
    });
  }

  // Transaction events (state transitions)
  for (const event of events) {
    timeline.push({
      timestamp: event.createdAt.toISOString(),
      stage: event.eventType,
      status: event.status,
      actor: event.actor,
    });
  }

  // Audit logs (actions)
  for (const log of auditLogs) {
    timeline.push({
      timestamp: log.createdAt.toISOString(),
      stage: log.action,
      status: log.severity,
      actor: log.userId ?? undefined,
    });
  }

  // Sort by timestamp
  timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return timeline;
}

// ===== Timeout Management =====

export interface StageTimeout {
  stage: string;
  timeoutMs: number;
  action: "RETRY" | "FAILOVER" | "FAIL" | "ESCALATE";
}

export const STAGE_TIMEOUTS: Record<string, StageTimeout> = {
  VALIDATE: { stage: "validate", timeoutMs: 5_000, action: "FAIL" },
  IDENTITY: { stage: "identity", timeoutMs: 10_000, action: "FAIL" },
  RISK: { stage: "risk", timeoutMs: 10_000, action: "FAIL" },
  ROUTE: { stage: "route", timeoutMs: 5_000, action: "FAIL" },
  INITIALIZE: { stage: "initialize", timeoutMs: 30_000, action: "RETRY" },
  PROCESS: { stage: "process", timeoutMs: 30_000, action: "FAILOVER" },
  AWAIT_CONFIRMATION: { stage: "await_confirmation", timeoutMs: 300_000, action: "ESCALATE" },
  POST_LEDGER: { stage: "post_ledger", timeoutMs: 10_000, action: "RETRY" },
  NOTIFY: { stage: "notify", timeoutMs: 10_000, action: "RETRY" },
};

export async function withTimeout<T>(
  promise: Promise<T>,
  stage: string,
  timeoutMs?: number
): Promise<T> {
  const config = STAGE_TIMEOUTS[stage];
  const ms = timeoutMs ?? config?.timeoutMs ?? 30_000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () =>
          reject(new Error(`Stage ${stage} timed out after ${ms}ms`))
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// ===== Observability =====

export interface PaymentObservabilityData {
  correlationId: string;
  provider?: string;
  country: string;
  currency: string;
  amount: number;
  riskScore?: number;
  pluginVersion?: string;
  sdkVersion?: string;
  latencyMs: number;
  webhookDelayMs?: number;
  settlementTimeHours?: number;
  stages: { name: string; durationMs: number; status: string }[];
}

export function recordObservability(data: PaymentObservabilityData): void {
  // In production this would go to Prometheus/Datadog
  // For now, log it
  console.log(
    `[observability] ${data.correlationId} | ${data.provider} | ${data.country} | ${data.currency} | ${data.amount} | ${data.latencyMs}ms | stages: ${data.stages.length}`
  );
}
