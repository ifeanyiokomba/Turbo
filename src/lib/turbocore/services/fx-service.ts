// TurboCore Bounded Service — FX Service
//
// Thin facade over the FX engine (fx/convert.ts). Provides live exchange
// rates, locked quotes with spread + markup, and atomic currency
// conversion between a user's multi-currency wallets.
//
// Quotes are valid for 60 seconds; rate snapshots are cached in
// FxRateSnapshot for 5 minutes. The actual FX execution debits the
// source CurrencyWallet and credits the target CurrencyWallet atomically.

import { db } from "@/lib/db";
import { getRate, getQuote, convertCurrency, type FxQuote } from "@/lib/turbocore/fx/convert";

export interface RateResult {
  rate: number;
  source: string;
  fetchedAt: Date;
  expiresAt: Date;
}

export interface ConvertResult {
  ok: boolean;
  creditMinor?: number;
  error?: string;
}

export const fxService = {
  /** Get the current exchange rate for a currency pair (with 5-min cache). */
  async getRate(base: string, quote: string): Promise<RateResult> {
    return getRate(base, quote);
  },

  /** Get a locked FX quote (rate + fee + total debit/credit) valid for 60s. */
  async getQuote(from: string, to: string, amountMinor: number): Promise<FxQuote> {
    return getQuote({ from, to, amountMinor });
  },

  /** Execute a currency conversion between a user's multi-currency wallets. */
  async convert(
    userId: string,
    from: string,
    to: string,
    amountMinor: number
  ): Promise<ConvertResult> {
    return convertCurrency({ userId, from, to, amountMinor });
  },

  /** List recent FX rate snapshots (newest first), optional pair filter. */
  async getRates(base?: string, quote?: string, limit = 50) {
    return db.fxRateSnapshot.findMany({
      where: {
        ...(base ? { base } : {}),
        ...(quote ? { quote } : {}),
      },
      orderBy: { fetchedAt: "desc" },
      take: Math.min(Math.max(limit, 1), 200),
    });
  },
};
