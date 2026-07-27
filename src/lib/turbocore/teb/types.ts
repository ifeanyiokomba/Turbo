// TurboCore — TEB Event Types (Chapter 9)
//
// Every event follows one canonical format. Only the payload changes.
//
//   Event {
//     eventId, eventType, aggregateId, aggregateType,
//     correlationId, causationId, version, timestamp,
//     source, actor, country, payload, metadata,
//     stream, category, priority, classification, checksum
//   }
//
// All events are versioned, classified, and carry correlation + causation
// IDs for distributed tracing.

// ---------------------------------------------------------------------------
// Event categories (Chapter 9)
// ---------------------------------------------------------------------------

export type EventCategory =
  "BUSINESS" | "FINANCIAL" | "PROVIDER" | "COMPLIANCE" | "SYSTEM" | "ANALYTICS" | "SECURITY";

// ---------------------------------------------------------------------------
// Event streams (Chapter 9 — separate queues, never dump into one)
// ---------------------------------------------------------------------------

export type EventStream =
  | "payments"
  | "wallets"
  | "ledger"
  | "provider"
  | "compliance"
  | "merchant"
  | "analytics"
  | "security"
  | "system";

// ---------------------------------------------------------------------------
// Event priority (Chapter 9)
// ---------------------------------------------------------------------------

export type EventPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

// ---------------------------------------------------------------------------
// Event classification (Chapter 9 — security)
// ---------------------------------------------------------------------------

export type EventClassification = "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";

// ---------------------------------------------------------------------------
// The canonical event structure (Chapter 9)
// ---------------------------------------------------------------------------

export interface TebEvent<T = unknown> {
  /** Globally unique event ID (ULID — time-sortable). */
  eventId: string;
  /** Event type, e.g. "PAYMENT.CREATED", "KYC.APPROVED". */
  eventType: string;
  /** The aggregate this event belongs to (e.g. transaction ID). */
  aggregateId: string;
  /** Aggregate type: TRANSACTION | USER | WALLET | MERCHANT | PROVIDER | SETTLEMENT. */
  aggregateType: string;
  /** Correlation ID — traces a request across all services. */
  correlationId: string;
  /** Causation ID — the event that caused this one (null for root events). */
  causationId: string | null;
  /** Event schema version (v1, v2, etc.). */
  version: string;
  /** ISO 8601 timestamp. */
  timestamp: string;
  /** Which service emitted this event. */
  source: string;
  /** Who triggered the event (userId, "SYSTEM", "CRON"). */
  actor: string;
  /** Country context (ISO code). */
  country: string | null;
  /** Event payload — the actual data. */
  payload: T;
  /** Metadata — additional context (IP, UA, providerCode, etc.). */
  metadata: Record<string, unknown>;
  /** Which stream this event belongs to. */
  stream: EventStream;
  /** Event category. */
  category: EventCategory;
  /** Priority level. */
  priority: EventPriority;
  /** Security classification. */
  classification: EventClassification;
  /** Checksum of payload for integrity verification. */
  checksum: string;
  /** Whether the payload is encrypted. */
  encrypted: boolean;
  /** Aggregate version (for optimistic concurrency). */
  aggregateVersion: number;
}

// ---------------------------------------------------------------------------
// Event contract (Chapter 9 — "Treat events like public APIs")
// ---------------------------------------------------------------------------

export interface EventContract {
  /** Event type, e.g. "PAYMENT.CREATED". */
  eventType: string;
  /** Human-friendly name. */
  name: string;
  /** Description. */
  description: string;
  /** Category. */
  category: EventCategory;
  /** Stream. */
  stream: EventStream;
  /** Default priority. */
  priority: EventPriority;
  /** Default classification. */
  classification: EventClassification;
  /** Owning domain. */
  owner: string;
  /** Producing service. */
  producer: string;
  /** Consuming services. */
  consumers: string[];
  /** Current version. */
  version: string;
  /** Whether events must stay ordered within an aggregate. */
  ordered: boolean;
  /** Retention policy. */
  retention: EventRetention;
  /** Required payload fields. */
  requiredFields: string[];
  /** Optional payload fields. */
  optionalFields: string[];
  /** Example payload. */
  example: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Event retention (Chapter 9)
// ---------------------------------------------------------------------------

export interface EventRetention {
  policy: "FOREVER" | "YEARS" | "DAYS";
  value?: number; // years or days
  reason: string;
}

// ---------------------------------------------------------------------------
// Event status (for the outbox + event store)
// ---------------------------------------------------------------------------

export type EventStatus = "PENDING" | "PUBLISHED" | "FAILED" | "DEAD_LETTER";

// ---------------------------------------------------------------------------
// Retry strategy (Chapter 9 — exponential backoff)
// ---------------------------------------------------------------------------

export const RETRY_BACKOFF_MS = [60_000, 300_000, 900_000, 3_600_000]; // 1min, 5min, 15min, 1hour
export const MAX_RETRY_ATTEMPTS = 4;

export interface RetryInfo {
  attempt: number;
  nextRetryAt: string | null;
  lastError: string | null;
  exhausted: boolean;
}

export function calculateNextRetry(attempt: number): string | null {
  if (attempt >= MAX_RETRY_ATTEMPTS) return null;
  const delay = RETRY_BACKOFF_MS[Math.min(attempt, RETRY_BACKOFF_MS.length - 1)];
  return new Date(Date.now() + delay).toISOString();
}

export function getRetryInfo(attempts: number, lastError: string | null): RetryInfo {
  return {
    attempt: attempts,
    nextRetryAt: calculateNextRetry(attempts),
    lastError,
    exhausted: attempts >= MAX_RETRY_ATTEMPTS,
  };
}
