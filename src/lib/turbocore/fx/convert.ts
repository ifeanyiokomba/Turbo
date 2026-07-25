// TurboCore FX engine — rate snapshots, config (spread/markup), quote, convert.

import { db } from "@/lib/db";
import { generateReference } from "@/lib/money";
import { creditWallet, debitWallet } from "@/lib/ledger";

const RATE_TTL_MS = 5 * 60_000; // 5 min

// Seed/demo rates (in prod: fetched from IExchangeRateProvider adapters)
const DEMO_RATES: Record<string, number> = {
  "NGN-USD": 1480,
  "USD-NGN": 1 / 1480,
  "NGN-KES": 11.4,
  "KES-NGN": 1 / 11.4,
  "NGN-GHS": 0.012,
  "GHS-NGN": 1 / 0.012,
  "USD-KES": 168,
  "KES-USD": 1 / 168,
  "USD-GHS": 14.2,
  "GHS-USD": 1 / 14.2,
  "USD-GBP": 0.79,
  "GBP-USD": 1 / 0.79,
  "NGN-ZAR": 0.080,
  "ZAR-NGN": 1 / 0.080,
};

export async function getRate(base: string, quote: string): Promise<{ rate: number; source: string; fetchedAt: Date; expiresAt: Date }> {
  // Check DB snapshot
  const recent = await db.fxRateSnapshot.findFirst({
    where: { base, quote, expiresAt: { gt: new Date() } },
    orderBy: { fetchedAt: "desc" },
  });
  if (recent) {
    return { rate: recent.rate, source: recent.source, fetchedAt: recent.fetchedAt, expiresAt: recent.expiresAt };
  }
  // Fallback to demo rate
  const rate = DEMO_RATES[`${base}-${quote}`] ?? 1;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + RATE_TTL_MS);
  await db.fxRateSnapshot.create({
    data: { base, quote, rate, source: "demo-market", fetchedAt: now, expiresAt },
  }).catch(() => {});
  return { rate, source: "demo-market", fetchedAt: now, expiresAt };
}

export async function getFxConfig(base: string, quote: string) {
  const cfg = await db.fxConfig.findUnique({ where: { base_quote: { base, quote } } });
  return {
    spreadBps: cfg?.spreadBps ?? 150,
    markupBps: cfg?.markupBps ?? 50,
    feeFixedMinor: cfg?.feeFixedMinor ?? 0,
    feeBps: cfg?.feeBps ?? 0,
  };
}

export interface FxQuote {
  quoteId: string;
  base: string;
  quote: string;
  rate: number;
  feeMinor: number;
  totalDebitMinor: number;
  totalCreditMinor: number;
  expiresAt: string;
}

export async function getQuote(req: { from: string; to: string; amountMinor: number }): Promise<FxQuote> {
  const { rate } = await getRate(req.from, req.to);
  const cfg = await getFxConfig(req.from, req.to);
  const spreadMultiplier = 1 + (cfg.spreadBps + cfg.markupBps) / 10000;
  const appliedRate = rate * spreadMultiplier;
  const feeMinor = cfg.feeFixedMinor + Math.round((req.amountMinor * cfg.feeBps) / 10000);
  const totalDebitMinor = req.amountMinor + feeMinor;
  const totalCreditMinor = Math.round(req.amountMinor * appliedRate);
  const expiresAt = new Date(Date.now() + 60_000); // 60s lock
  return {
    quoteId: generateReference("FX"),
    base: req.from,
    quote: req.to,
    rate: appliedRate,
    feeMinor,
    totalDebitMinor,
    totalCreditMinor,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function convertCurrency(req: {
  userId: string;
  from: string;
  to: string;
  amountMinor: number;
}): Promise<{ ok: boolean; creditMinor?: number; error?: string }> {
  const quote = await getQuote({ from: req.from, to: req.to, amountMinor: req.amountMinor });
  // Debit source currency wallet
  try {
    await debitCurrencyWallet({ userId: req.userId, currency: req.from, amountMinor: quote.totalDebitMinor, refType: "FX_CONVERT", description: `FX ${req.from}→${req.to}` });
    await creditCurrencyWallet({ userId: req.userId, currency: req.to, amountMinor: quote.totalCreditMinor, refType: "FX_CONVERT", description: `FX ${req.from}→${req.to}` });
    return { ok: true, creditMinor: quote.totalCreditMinor };
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Conversion failed" };
  }
}

// Multi-currency wallet helpers (mirror ledger.ts but for CurrencyWallet)
export async function creditCurrencyWallet(opts: { userId: string; currency: string; amountMinor: number; refType: string; refId?: string; description: string; pairId?: string }) {
  let wallet = await db.currencyWallet.findUnique({ where: { userId_currency: { userId: opts.userId, currency: opts.currency } } });
  if (!wallet) {
    wallet = await db.currencyWallet.create({ data: { userId: opts.userId, currency: opts.currency, balanceMinor: 0 } });
  }
  if (wallet.status !== "ACTIVE") throw new Error(`Wallet ${opts.currency} is ${wallet.status}`);
  const newBalance = wallet.balanceMinor + opts.amountMinor;
  const entry = await db.currencyLedgerEntry.create({
    data: {
      currencyWalletId: wallet.id,
      userId: opts.userId,
      entryType: "CREDIT",
      amountMinor: opts.amountMinor,
      currency: opts.currency,
      refType: opts.refType,
      refId: opts.refId ?? null,
      pairId: opts.pairId ?? null,
      balanceAfterMinor: newBalance,
      description: opts.description,
    },
  });
  await db.currencyWallet.update({ where: { id: wallet.id }, data: { balanceMinor: newBalance, version: { increment: 1 } } });
  return { wallet, entry, newBalance };
}

export async function debitCurrencyWallet(opts: { userId: string; currency: string; amountMinor: number; refType: string; refId?: string; description: string; pairId?: string }) {
  const wallet = await db.currencyWallet.findUnique({ where: { userId_currency: { userId: opts.userId, currency: opts.currency } } });
  if (!wallet) throw new Error(`${opts.currency} wallet not found`);
  if (wallet.status !== "ACTIVE") throw new Error(`Wallet ${opts.currency} is ${wallet.status}`);
  if (wallet.balanceMinor < opts.amountMinor) throw new Error(`Insufficient ${opts.currency} balance`);
  const updated = await db.currencyWallet.updateMany({
    where: { id: wallet.id, balanceMinor: { gte: opts.amountMinor }, status: "ACTIVE" },
    data: { balanceMinor: { decrement: opts.amountMinor }, version: { increment: 1 } },
  });
  if (updated.count === 0) throw new Error(`Insufficient ${opts.currency} balance (race)`);
  const newBalance = wallet.balanceMinor - opts.amountMinor;
  const entry = await db.currencyLedgerEntry.create({
    data: {
      currencyWalletId: wallet.id,
      userId: opts.userId,
      entryType: "DEBIT",
      amountMinor: opts.amountMinor,
      currency: opts.currency,
      refType: opts.refType,
      refId: opts.refId ?? null,
      pairId: opts.pairId ?? null,
      balanceAfterMinor: newBalance,
      description: opts.description,
    },
  });
  return { wallet, entry, newBalance };
}
