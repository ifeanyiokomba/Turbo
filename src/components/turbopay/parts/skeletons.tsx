"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";

/**
 * Skeleton primitives for Turbopay views.
 *
 * Uses the `tp-shimmer` brand sweep (defined in globals.css) for the
 * placeholder blocks. `tp-sheen` provides the layered overlay sweep on the
 * wallet card skeleton. Every skeleton is `aria-hidden` so screen readers
 * skip the placeholder.
 *
 * Note: previously these used `animate-pulse` on each bar. We now use the
 * `tp-shimmer` class on each bar for a single, polished brand-aligned effect
 * (gradient sweep across the bar rather than a global fade).
 */

const sheenWrap = "tp-sheen relative overflow-hidden";

/** Matches the BalanceCard (tp-wallet-card, aspect-[1.7/1], p-5 sm:p-6). */
export function BalanceCardSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`tp-wallet-card ${sheenWrap} aspect-[1.7/1] w-full max-w-md rounded-3xl p-5 text-white sm:p-6 ${className}`}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="tp-shimmer h-3 w-24 rounded-full" />
          <div className="tp-shimmer h-7 w-40 rounded-full opacity-90" />
        </div>
        <div className="tp-shimmer h-8 w-8 rounded-full" />
      </div>

      <div className="mt-6 flex items-center justify-between">
        <div className="space-y-1.5">
          <div className="tp-shimmer h-2.5 w-20 rounded-full opacity-80" />
          <div className="tp-shimmer h-4 w-36 rounded-full" />
        </div>
        <div className="tp-shimmer h-5 w-12 rounded-full opacity-80" />
      </div>

      <div className="mt-5 flex gap-2">
        <div className="tp-shimmer h-7 w-24 rounded-full" />
        <div className="tp-shimmer h-7 w-24 rounded-full opacity-70" />
      </div>
    </div>
  );
}

/** Matches the StatCard (Card p-5 with label, icon tile, value, hint). */
export function StatCardSkeleton({ className = "" }: { className?: string }) {
  return (
    <Card aria-hidden className={`${sheenWrap} p-5 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="tp-shimmer h-3 w-20 rounded-full" />
        <div className="tp-shimmer h-9 w-9 rounded-lg" />
      </div>
      <div className="tp-shimmer mt-3 h-6 w-24 rounded-full" />
      <div className="tp-shimmer mt-1 h-2.5 w-16 rounded-full opacity-80" />
    </Card>
  );
}

/** Matches the TransactionItem button row (icon + 2 lines + right-aligned amount). */
export function TransactionItemSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`flex items-center gap-3 rounded-xl px-2 py-2.5 ${className}`}
    >
      <div className="tp-shimmer h-10 w-10 shrink-0 rounded-full" />
      <div className="flex-1 space-y-1.5">
        <div className="tp-shimmer h-3.5 w-3/4 rounded-full" />
        <div className="tp-shimmer h-2.5 w-1/2 rounded-full opacity-80" />
      </div>
      <div className="space-y-1.5 text-right">
        <div className="tp-shimmer ml-auto h-3.5 w-16 rounded-full" />
        <div className="tp-shimmer ml-auto h-2.5 w-12 rounded-full opacity-80" />
      </div>
    </div>
  );
}

/** Generic table-row skeleton — useful for admin/paginated tables. */
export function TableRowSkeleton({
  cells = 4,
  className = "",
}: {
  cells?: number;
  className?: string;
}) {
  return (
    <tr aria-hidden className={`border-b ${className}`}>
      {Array.from({ length: cells }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div
            className="tp-shimmer h-4 rounded-full"
            style={{ maxWidth: `${100 - i * 8}%` }}
          />
        </td>
      ))}
    </tr>
  );
}
