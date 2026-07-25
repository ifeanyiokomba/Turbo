"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";

/**
 * Skeleton primitives for Turbopay views.
 * - Use `tp-sheen` (the brand shimmer sweep defined in globals.css) on the
 *   container plus `animate-pulse` on the inner placeholder bars to create a
 *   layered shimmer + pulse loading effect that matches the emerald+amber brand.
 * - Every skeleton is `aria-hidden` so screen readers skip the placeholder.
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
          <div className="h-3 w-24 animate-pulse rounded-full bg-white/25" />
          <div className="h-7 w-40 animate-pulse rounded-full bg-white/35" />
        </div>
        <div className="h-8 w-8 animate-pulse rounded-full bg-white/25" />
      </div>

      <div className="mt-6 flex items-center justify-between">
        <div className="space-y-1.5">
          <div className="h-2.5 w-20 animate-pulse rounded-full bg-white/20" />
          <div className="h-4 w-36 animate-pulse rounded-full bg-white/30" />
        </div>
        <div className="h-5 w-12 animate-pulse rounded-full bg-white/20" />
      </div>

      <div className="mt-5 flex gap-2">
        <div className="h-7 w-24 animate-pulse rounded-full bg-white/25" />
        <div className="h-7 w-24 animate-pulse rounded-full bg-white/15" />
      </div>
    </div>
  );
}

/** Matches the StatCard (Card p-4 with label, icon tile, value, hint). */
export function StatCardSkeleton({ className = "" }: { className?: string }) {
  return (
    <Card aria-hidden className={`${sheenWrap} p-4 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="h-3 w-20 animate-pulse rounded-full bg-muted" />
        <div className="h-8 w-8 animate-pulse rounded-lg bg-muted" />
      </div>
      <div className="mt-2 h-6 w-24 animate-pulse rounded-full bg-muted" />
      <div className="mt-1 h-2.5 w-16 animate-pulse rounded-full bg-muted/70" />
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
      <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-muted" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3.5 w-3/4 animate-pulse rounded-full bg-muted" />
        <div className="h-2.5 w-1/2 animate-pulse rounded-full bg-muted/70" />
      </div>
      <div className="space-y-1.5 text-right">
        <div className="ml-auto h-3.5 w-16 animate-pulse rounded-full bg-muted" />
        <div className="ml-auto h-2.5 w-12 animate-pulse rounded-full bg-muted/70" />
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
            className="h-4 animate-pulse rounded-full bg-muted"
            style={{ maxWidth: `${100 - i * 8}%` }}
          />
        </td>
      ))}
    </tr>
  );
}
