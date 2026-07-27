// TurboCore — OMO Structured Logger + Metrics + Tracing (Chapter 12, Pillars 1-3)
//
// Pillar 1: Structured Logging — machine-readable JSON logs with correlation IDs
// Pillar 2: Metrics — everything measurable becomes a metric
// Pillar 3: Distributed Tracing — every request carries a trace ID

import type { StructuredLog, LogLevel, Metric, MetricType } from "./types";

// ---------------------------------------------------------------------------
// Sensitive data masking (Chapter 12 — "Never log sensitive data")
// ---------------------------------------------------------------------------

const SENSITIVE_KEYS = [
  "password",
  "pin",
  "token",
  "secret",
  "apiKey",
  "api_key",
  "cvv",
  "pan",
  "cardNumber",
  "bvn",
  "nin",
  "otp",
  "authorization",
  "cookie",
  "privateKey",
];

function maskSensitiveData(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data === "string") {
    // Mask strings that look like secrets
    if (data.length > 8 && /^(sk_|pk_|sec_|tok_)/.test(data)) {
      return data.slice(0, 6) + "****" + data.slice(-4);
    }
    return data;
  }
  if (typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (SENSITIVE_KEYS.some((s) => key.toLowerCase().includes(s))) {
        result[key] = typeof value === "string" ? "****" : null;
      } else {
        result[key] = maskSensitiveData(value);
      }
    }
    return result;
  }
  return data;
}

// ---------------------------------------------------------------------------
// Structured Logger (Pillar 1)
// ---------------------------------------------------------------------------

const logBuffer: StructuredLog[] = [];
const MAX_LOG_BUFFER = 500;

export function log(entry: Omit<StructuredLog, "timestamp"> & { timestamp?: string }): void {
  const logEntry: StructuredLog = {
    timestamp: entry.timestamp ?? new Date().toISOString(),
    ...entry,
    metadata: maskSensitiveData(entry.metadata) as Record<string, unknown> | undefined,
  };
  logBuffer.push(logEntry);
  if (logBuffer.length > MAX_LOG_BUFFER) {
    logBuffer.shift();
  }

  // Also write to console for development visibility
  const level = entry.level;
  const msg = `[${level}] [${entry.service}] ${entry.message}`;
  if (level === "ERROR" || level === "FATAL") {
    console.error(msg, entry.metadata ?? "");
  } else if (level === "WARN") {
    console.warn(msg, entry.metadata ?? "");
  } else {
    console.log(msg, entry.metadata ?? "");
  }
}

// Convenience methods
export const logger = {
  trace: (service: string, message: string, ctx?: Partial<StructuredLog>) =>
    log({ level: "TRACE", service, message, ...ctx }),
  debug: (service: string, message: string, ctx?: Partial<StructuredLog>) =>
    log({ level: "DEBUG", service, message, ...ctx }),
  info: (service: string, message: string, ctx?: Partial<StructuredLog>) =>
    log({ level: "INFO", service, message, ...ctx }),
  warn: (service: string, message: string, ctx?: Partial<StructuredLog>) =>
    log({ level: "WARN", service, message, ...ctx }),
  error: (service: string, message: string, ctx?: Partial<StructuredLog>) =>
    log({ level: "ERROR", service, message, ...ctx }),
  fatal: (service: string, message: string, ctx?: Partial<StructuredLog>) =>
    log({ level: "FATAL", service, message, ...ctx }),
};

export function getRecentLogs(limit = 100, level?: LogLevel): StructuredLog[] {
  let logs = [...logBuffer].reverse();
  if (level)
    logs = logs.filter((l) => l.level === level || logLevelValue(l.level) >= logLevelValue(level));
  return logs.slice(0, limit);
}

export function searchLogs(query: string, limit = 50): StructuredLog[] {
  const q = query.toLowerCase();
  return logBuffer
    .filter(
      (l) =>
        l.message.toLowerCase().includes(q) ||
        l.service.toLowerCase().includes(q) ||
        l.correlationId?.toLowerCase().includes(q) ||
        l.transactionId?.toLowerCase().includes(q) ||
        l.provider?.toLowerCase().includes(q)
    )
    .slice(-limit)
    .reverse();
}

function logLevelValue(level: LogLevel): number {
  return { TRACE: 0, DEBUG: 1, INFO: 2, WARN: 3, ERROR: 4, FATAL: 5 }[level];
}

// ---------------------------------------------------------------------------
// Metrics Collection (Pillar 2)
// ---------------------------------------------------------------------------

const metricsBuffer: Metric[] = [];
const MAX_METRICS_BUFFER = 1000;

export function recordMetric(
  name: string,
  type: MetricType,
  value: number,
  unit: string,
  labels: Record<string, string> = {}
): void {
  metricsBuffer.push({
    name,
    type,
    value,
    unit,
    labels,
    timestamp: new Date().toISOString(),
  });
  if (metricsBuffer.length > MAX_METRICS_BUFFER) metricsBuffer.shift();
}

// Counter helpers
export function incrementCounter(name: string, labels: Record<string, string> = {}): void {
  recordMetric(name, "COUNTER", 1, "count", labels);
}

export function recordTimer(name: string, ms: number, labels: Record<string, string> = {}): void {
  recordMetric(name, "TIMER", ms, "ms", labels);
}

export function recordGauge(
  name: string,
  value: number,
  unit: string,
  labels: Record<string, string> = {}
): void {
  recordMetric(name, "GAUGE", value, unit, labels);
}

export function getMetrics(limit = 100, name?: string): Metric[] {
  let metrics = [...metricsBuffer].reverse();
  if (name) metrics = metrics.filter((m) => m.name === name);
  return metrics.slice(0, limit);
}

export function getMetricSummary(): Record<
  string,
  { count: number; avg: number; min: number; max: number; last: number }
> {
  const summary: Record<
    string,
    { count: number; avg: number; min: number; max: number; last: number }
  > = {};
  const byName: Record<string, number[]> = {};

  for (const m of metricsBuffer) {
    if (!byName[m.name]) byName[m.name] = [];
    byName[m.name].push(m.value);
  }

  for (const [name, values] of Object.entries(byName)) {
    summary[name] = {
      count: values.length,
      avg: values.reduce((s, v) => s + v, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      last: values[values.length - 1],
    };
  }

  return summary;
}

// ---------------------------------------------------------------------------
// Distributed Tracing (Pillar 3)
// ---------------------------------------------------------------------------

export interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  service: string;
  operation: string;
  startTime: string;
  endTime?: string;
  durationMs?: number;
  status: "OK" | "ERROR" | "PENDING";
  tags: Record<string, string>;
}

const traces: TraceSpan[] = [];
const MAX_TRACES = 200;

export function startTrace(service: string, operation: string, correlationId?: string): TraceSpan {
  const span: TraceSpan = {
    traceId: correlationId ?? `trace_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    spanId: `span_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    parentSpanId: null,
    service,
    operation,
    startTime: new Date().toISOString(),
    status: "PENDING",
    tags: {},
  };
  traces.push(span);
  if (traces.length > MAX_TRACES) traces.shift();
  return span;
}

export function endTrace(span: TraceSpan, status: "OK" | "ERROR" = "OK"): void {
  span.endTime = new Date().toISOString();
  span.durationMs = new Date(span.endTime).getTime() - new Date(span.startTime).getTime();
  span.status = status;
}

export function getTraces(limit = 50, traceId?: string): TraceSpan[] {
  let result = [...traces].reverse();
  if (traceId) result = result.filter((t) => t.traceId === traceId);
  return result.slice(0, limit);
}

export function getTraceTimeline(traceId: string): TraceSpan[] {
  return traces
    .filter((t) => t.traceId === traceId)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
}
