// Shared helpers for the TurboCore admin tabs (Providers/Capabilities/Routing/
// Webhooks/Compliance/Feature Flags/Config History). Includes:
//   - exportCsv (escape commas/quotes/newlines, trigger a Blob download)
//   - tone maps for circuit states, health scores, settlement statuses, etc.
//   - small primitive UI helpers shared across tabs.

import * as React from "react";
import { Badge } from "@/components/ui/badge";

export function exportCsv(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
): void {
  const escape = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [
    headers.map(escape).join(","),
    ...rows.map((r) => r.map(escape).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Circuit breaker state tone — CLOSED=emerald, OPEN=red, HALF_OPEN=amber.
export const CIRCUIT_TONE: Record<string, string> = {
  CLOSED: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  OPEN: "bg-red-500/10 text-red-600 dark:text-red-400",
  HALF_OPEN: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

// ComplianceCase status tone — CLOSED=emerald, OPEN=red, IN_REVIEW=amber, ESCALATED=red bold.
export const CASE_STATUS_TONE: Record<string, string> = {
  OPEN: "bg-red-500/10 text-red-600 dark:text-red-400",
  IN_REVIEW: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  ESCALATED: "bg-red-500/15 text-red-700 dark:text-red-300 font-bold",
  CLOSED: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
};

// Settlement status tone — CONFIRMED/RECONCILED=emerald, PENDING=amber.
export const SETTLE_TONE: Record<string, string> = {
  PENDING: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  CONFIRMED: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  RECONCILED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

// Audit-severity tone (reused for AML flag severity).
export const SEVERITY_TONE: Record<string, string> = {
  LOW: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  MEDIUM: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  HIGH: "bg-red-500/10 text-red-600 dark:text-red-400",
  INFO: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
  WARN: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  ERROR: "bg-red-500/10 text-red-600 dark:text-red-400",
  CRITICAL: "bg-red-500/15 text-red-700 dark:text-red-300 font-bold",
};

// Health-score color (0-100): >70 green, 30-70 amber, <30 red.
export function healthTone(score: number): { bg: string; bar: string; text: string } {
  if (score >= 70) return { bg: "bg-emerald-500/10", bar: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" };
  if (score >= 30) return { bg: "bg-amber-500/10", bar: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" };
  return { bg: "bg-red-500/10", bar: "bg-red-500", text: "text-red-600 dark:text-red-400" };
}

// Pretty-print a JSON string. Falls back to the raw string on parse error.
export function prettyJSON(s: string | null | undefined): string {
  if (!s) return "";
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

// Truncate a long string for display.
export function truncate(s: string, max = 60): string {
  if (!s) return "";
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

// Small badge for boolean true/false with brand colors.
export function BoolBadge({ value, trueLabel, falseLabel }: { value: boolean; trueLabel?: string; falseLabel?: string }) {
  return (
    <Badge
      variant="secondary"
      className={`text-[10px] ${
        value
          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "bg-muted text-muted-foreground"
      }`}
    >
      {value ? (trueLabel ?? "Yes") : (falseLabel ?? "No")}
    </Badge>
  );
}

// A small horizontal progress bar for health scores (0..100).
export function HealthBar({ score }: { score: number }) {
  const t = healthTone(score);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${t.bar}`} style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
      </div>
      <span className={`text-xs tabular-nums font-medium ${t.text}`}>{score}</span>
    </div>
  );
}

// Currency formatter — takes minor units + ISO currency code.
export function formatMinor(minor: number, currency = "NGN"): string {
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(minor / 100);
  } catch {
    return `${minor} ${currency}`;
  }
}

export function formatMinorCompact(minor: number, currency = "NGN"): string {
  const n = minor / 100;
  if (Math.abs(n) >= 1_000_000) return `${currency} ${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${currency} ${(n / 1_000).toFixed(1)}K`;
  return `${currency} ${n.toFixed(0)}`;
}

// All 11 TurboCore contract names (for dropdowns).
export const ALL_CONTRACTS = [
  "VIRTUAL_ACCOUNT",
  "CARD_PAYMENT",
  "BANK_TRANSFER",
  "BILL_PAYMENT",
  "AIRTIME",
  "KYC",
  "NOTIFICATION",
  "INTERNATIONAL_TRANSFER",
  "MOBILE_MONEY",
  "EXCHANGE_RATE",
  "VIRTUAL_CARD_ISSUER",
] as const;

// Common ISO country codes for the matrix editor.
export const COMMON_COUNTRIES = ["ALL", "NG", "KE", "GH", "ZA", "GB", "US"] as const;
export const COMMON_CURRENCIES = ["ALL", "NGN", "KES", "GHS", "ZAR", "GBP", "USD"] as const;
