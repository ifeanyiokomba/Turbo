"use client";

import * as React from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Smartphone,
  Receipt,
  CreditCard,
  PiggyBank,
  TrendingUp,
  Zap,
  Gift,
  Plus,
  StickyNote,
} from "lucide-react";
import { naira, timeAgo } from "@/lib/money";
import { Badge } from "@/components/ui/badge";

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  FUNDING: ArrowDownLeft,
  TRANSFER: ArrowUpRight,
  AIRTIME: Smartphone,
  DATA: Zap,
  BILL: Receipt,
  CARD_FUND: CreditCard,
  CARD_WITHDRAW: ArrowUpRight,
  REWARD: Gift,
  REFERRAL: Gift,
  SAVINGS_DEPOSIT: PiggyBank,
  SAVINGS_WITHDRAW: PiggyBank,
  INVESTMENT: TrendingUp,
};

export function TransactionItem({
  tx,
  onClick,
}: {
  tx: {
    type: string;
    direction: string;
    amountKobo: number;
    description?: string | null;
    counterpartyName?: string | null;
    status: string;
    createdAt: string | Date;
    note?: string | null;
  };
  onClick?: () => void;
}) {
  const Icon = TYPE_ICON[tx.type] ?? Plus;
  const isCredit = tx.direction === "CREDIT";
  const hasNote = !!tx.note && tx.note.trim().length > 0;
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-muted/60"
    >
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
          isCredit ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
        }`}
      >
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium">
            {tx.counterpartyName || tx.description || tx.type}
          </p>
          {hasNote && (
            <span
              title={tx.note!.length > 60 ? tx.note!.slice(0, 60) + "…" : tx.note!}
              className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber-600 dark:text-amber-400"
            >
              <StickyNote className="h-2.5 w-2.5" />
              Note
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {tx.description ? (tx.counterpartyName ? tx.description : timeAgo(tx.createdAt)) : timeAgo(tx.createdAt)}
        </p>
      </div>
      <div className="text-right">
        <p className={`text-sm font-semibold tabular-nums ${isCredit ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"}`}>
          {isCredit ? "+" : "−"}{naira(tx.amountKobo)}
        </p>
        {tx.status !== "SUCCESS" && (
          <Badge variant="outline" className="mt-0.5 text-[10px]">{tx.status}</Badge>
        )}
      </div>
    </button>
  );
}
