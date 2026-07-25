"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { naira } from "@/lib/money";
import { Logo } from "../logo";
import { AnimatedNumber } from "./animated-number";
import { Eye, EyeOff, Copy, Check, Plus, ArrowUpRight } from "lucide-react";

export function BalanceCard({
  balanceKobo,
  accountNumber,
  accountName,
  onFund,
  onTransfer,
  hideBalance,
  onToggleHide,
}: {
  balanceKobo: number;
  accountNumber?: string;
  accountName?: string;
  onFund?: () => void;
  onTransfer?: () => void;
  hideBalance?: boolean;
  onToggleHide?: () => void;
}) {
  const [copied, setCopied] = React.useState(false);
  function copyAcc() {
    if (!accountNumber) return;
    navigator.clipboard.writeText(accountNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className="tp-wallet-card tp-float relative aspect-[1.7/1] w-full max-w-md rounded-3xl p-5 text-white tp-sheen sm:p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs opacity-80">Available balance</p>
          <div className="mt-1.5 flex items-center gap-2">
            <p className="text-2xl font-bold tabular-nums sm:text-3xl">
              {hideBalance ? (
                "₦ ••••••"
              ) : (
                <AnimatedNumber
                  value={balanceKobo}
                  duration={700}
                  format={naira}
                />
              )}
            </p>
            <button onClick={onToggleHide} className="opacity-70 hover:opacity-100">
              {hideBalance ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <Logo size={32} className="opacity-90" />
      </div>

      {accountNumber && (
        <div className="mt-6 flex items-center justify-between">
          <button onClick={copyAcc} className="group flex items-center gap-2 text-left">
            <div>
              <p className="text-[10px] opacity-70">Virtual account</p>
              <p className="font-mono text-sm tracking-wider">{accountNumber}</p>
            </div>
            {copied ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4 opacity-60 group-hover:opacity-100" />}
          </button>
          <span className="rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-semibold">VISA</span>
        </div>
      )}

      <div className="mt-5 flex gap-2">
        <button
          onClick={onFund}
          className="flex items-center gap-1.5 rounded-full bg-white/20 px-3.5 py-1.5 text-xs font-semibold backdrop-blur transition-colors hover:bg-white/30"
        >
          <Plus className="h-3.5 w-3.5" /> Add money
        </button>
        <button
          onClick={onTransfer}
          className="flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-1.5 text-xs font-semibold backdrop-blur transition-colors hover:bg-white/25"
        >
          <ArrowUpRight className="h-3.5 w-3.5" /> Transfer
        </button>
      </div>

      <p className="mt-4 text-[10px] font-medium opacity-50">
        Powered by Turbopay MFB · CBN-licensed partner
      </p>
    </div>
  );
}
