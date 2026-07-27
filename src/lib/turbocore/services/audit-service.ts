// TurboCore Bounded Service — Audit Service
//
// Thin facade over the AuditLog table + PaymentFlowLog/TransactionEvent
// timeline reconstruction. Every state-changing action in TurboPay writes
// an AuditLog row via api.audit(); this service exposes the read side +
// the transaction timeline view used by support + compliance.
//
// AuditLog rows are append-only and never deleted (only corrected by a
// new row with metadata.correctedById).

import { db } from "@/lib/db";
import { audit } from "@/lib/api";

export interface AuditLogInput {
  userId?: string;
  action: string;
  category: string;
  severity?: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditLogFilters {
  userId?: string;
  category?: string;
  severity?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

export interface TimelineEntry {
  id: string;
  source: "PAYMENT_FLOW" | "TRANSACTION_EVENT";
  step: string; // HOLD_DEBIT | PROVIDER_CALLED | CONFIRMED | SETTLED | ...
  status: string;
  actor?: string;
  actorId?: string;
  providerCode?: string;
  latencyMs?: number;
  payload?: Record<string, unknown>;
  at: Date;
}

export interface ExportResult {
  format: "JSON" | "CSV";
  count: number;
  rows: Record<string, unknown>[];
  csv?: string;
  generatedAt: Date;
}

function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Array.from(
    rows.reduce((set, r) => {
      for (const k of Object.keys(r)) set.add(k);
      return set;
    }, new Set<string>())
  );
  const escape = (v: unknown) => {
    if (v == null) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(headers.map((h) => escape(r[h])).join(","));
  }
  return lines.join("\n");
}

export const auditService = {
  /** Append a row to the AuditLog. Delegates to api.audit (never throws). */
  async log(input: AuditLogInput): Promise<void> {
    return audit(input);
  },

  /** List audit log rows with filters. Newest first. */
  async list(filters: AuditLogFilters = {}) {
    const where: Record<string, unknown> = {};
    if (filters.userId) where.userId = filters.userId;
    if (filters.category) where.category = filters.category;
    if (filters.severity) where.severity = filters.severity;
    if (filters.startDate || filters.endDate) {
      where.createdAt = {
        ...(filters.startDate ? { gte: filters.startDate } : {}),
        ...(filters.endDate ? { lte: filters.endDate } : {}),
      };
    }
    return db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(filters.limit ?? 50, 1), 500),
    });
  },

  /**
   * Reconstruct the full timeline for a transaction by merging PaymentFlowLog
   * (orchestrator steps: ROUTED, HOLD_DEBIT, PROVIDER_CALLED, FAILOVER,
   * AUTO_REVERSED, ...) and TransactionEvent (lifecycle: CREATED,
   * AUTHORIZED, SETTLED, FAILED, REVERSED, REFUNDED).
   */
  async getTimeline(transactionId: string): Promise<TimelineEntry[]> {
    const [flowLogs, events] = await Promise.all([
      db.paymentFlowLog.findMany({
        where: { transactionId },
        orderBy: { at: "asc" },
      }),
      db.transactionEvent.findMany({
        where: { transactionId },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const timeline: TimelineEntry[] = [];

    for (const f of flowLogs) {
      let payload: Record<string, unknown> | undefined;
      try {
        payload = f.payloadJSON ? JSON.parse(f.payloadJSON) : undefined;
      } catch {
        payload = undefined;
      }
      timeline.push({
        id: f.id,
        source: "PAYMENT_FLOW",
        step: f.step,
        status: f.status,
        providerCode: f.providerCode ?? undefined,
        latencyMs: f.latencyMs ?? undefined,
        payload,
        at: f.at,
      });
    }

    for (const e of events) {
      let payload: Record<string, unknown> | undefined;
      try {
        payload = e.payload ? JSON.parse(e.payload) : undefined;
      } catch {
        payload = undefined;
      }
      timeline.push({
        id: e.id,
        source: "TRANSACTION_EVENT",
        step: e.eventType,
        status: e.status,
        actor: e.actor,
        actorId: e.actorId ?? undefined,
        payload,
        at: e.createdAt,
      });
    }

    // Sort merged timeline chronologically (stable on equal timestamps).
    return timeline.sort((a, b) => a.at.getTime() - b.at.getTime());
  },

  /**
   * Export audit log rows matching the filters as JSON or CSV. CSV is
   * suitable for compliance dumps; JSON for programmatic consumption.
   */
  async export(
    filters: AuditLogFilters = {},
    format: "JSON" | "CSV" = "JSON"
  ): Promise<ExportResult> {
    const rows = await auditService.list({ ...filters, limit: filters.limit ?? 1000 });
    const plainRows = rows.map((r) => {
      let metadata: unknown = null;
      try {
        metadata = r.metadata ? JSON.parse(r.metadata) : null;
      } catch {
        metadata = r.metadata;
      }
      return {
        id: r.id,
        userId: r.userId,
        action: r.action,
        category: r.category,
        severity: r.severity,
        ip: r.ip,
        userAgent: r.userAgent,
        metadata,
        createdAt: r.createdAt.toISOString(),
      };
    });

    return {
      format,
      count: plainRows.length,
      rows: plainRows,
      csv: format === "CSV" ? rowsToCsv(plainRows) : undefined,
      generatedAt: new Date(),
    };
  },
};
