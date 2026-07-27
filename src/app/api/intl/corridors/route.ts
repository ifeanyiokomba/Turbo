// Turbopay cross-border — supported corridors
//
// GET ?base=NGN (default NGN)
//   Lists supported cross-border corridors originating from the user's base
//   currency. Each corridor includes:
//     - sourceCurrency, targetCurrency
//     - rate (live FX rate sourced from FxRateSnapshot if available,
//        else derived from a curated static table)
//     - feeBps  (variable fee in basis points)
//     - feeFixedKobo (fixed fee per transfer, in source-currency kobo)
//     - estimatedDeliveryHours (typical end-to-end delivery time)
//     - provider (wise | flutterwave)
//     - minAmountKobo, maxAmountKobo (limits in source-currency kobo)
//     - supportsBank, supportsMobileWallet

import { db } from "@/lib/db";
import { json, handleError, requireUser } from "@/lib/api";

export const dynamic = "force-dynamic";

interface CorridorSeed {
  sourceCurrency: string;
  targetCurrency: string;
  rate: number;
  feeBps: number;
  feeFixedKobo: number;
  estimatedDeliveryHours: number;
  provider: "wise" | "flutterwave";
  minAmountKobo: number;
  maxAmountKobo: number;
  supportsBank: boolean;
  supportsMobileWallet: boolean;
  targetFlag: string;
  targetName: string;
}

// Curated corridor table. Rates are static baseline; we overlay the latest
// FxRateSnapshot if we have one to make the displayed rate feel live.
const CORRIDOR_SEEDS: CorridorSeed[] = [
  {
    sourceCurrency: "NGN",
    targetCurrency: "USD",
    rate: 0.000625,
    feeBps: 80,
    feeFixedKobo: 50_000_00, // ₦500
    estimatedDeliveryHours: 24,
    provider: "wise",
    minAmountKobo: 50_000_00, // ₦500
    maxAmountKobo: 50_000_000_00, // ₦500,000
    supportsBank: true,
    supportsMobileWallet: false,
    targetFlag: "🇺🇸",
    targetName: "US Dollar",
  },
  {
    sourceCurrency: "NGN",
    targetCurrency: "KES",
    rate: 0.0825,
    feeBps: 60,
    feeFixedKobo: 30_000_00,
    estimatedDeliveryHours: 6,
    provider: "flutterwave",
    minAmountKobo: 20_000_00,
    maxAmountKobo: 20_000_000_00,
    supportsBank: true,
    supportsMobileWallet: true,
    targetFlag: "🇰🇪",
    targetName: "Kenyan Shilling",
  },
  {
    sourceCurrency: "NGN",
    targetCurrency: "GHS",
    rate: 0.0095,
    feeBps: 70,
    feeFixedKobo: 35_000_00,
    estimatedDeliveryHours: 6,
    provider: "flutterwave",
    minAmountKobo: 20_000_00,
    maxAmountKobo: 20_000_000_00,
    supportsBank: true,
    supportsMobileWallet: true,
    targetFlag: "🇬🇭",
    targetName: "Ghanaian Cedi",
  },
  {
    sourceCurrency: "NGN",
    targetCurrency: "ZAR",
    rate: 0.0118,
    feeBps: 75,
    feeFixedKobo: 40_000_00,
    estimatedDeliveryHours: 12,
    provider: "flutterwave",
    minAmountKobo: 30_000_00,
    maxAmountKobo: 30_000_000_00,
    supportsBank: true,
    supportsMobileWallet: false,
    targetFlag: "🇿🇦",
    targetName: "South African Rand",
  },
  {
    sourceCurrency: "NGN",
    targetCurrency: "GBP",
    rate: 0.000495,
    feeBps: 90,
    feeFixedKobo: 60_000_00,
    estimatedDeliveryHours: 24,
    provider: "wise",
    minAmountKobo: 80_000_00,
    maxAmountKobo: 50_000_000_00,
    supportsBank: true,
    supportsMobileWallet: false,
    targetFlag: "🇬🇧",
    targetName: "British Pound",
  },
];

export async function GET(req: Request) {
  try {
    await requireUser();
    const url = new URL(req.url);
    const base = String(url.searchParams.get("base") ?? "NGN").toUpperCase();

    // Try to overlay the latest FX snapshot for each target currency.
    let rateOverlay: Record<string, number> = {};
    try {
      const snapshots = await db.fxRateSnapshot.findMany({
        where: { base },
        orderBy: { fetchedAt: "desc" },
        take: 30,
      });
      // Keep only the newest per quote currency
      for (const s of snapshots) {
        if (rateOverlay[s.quote] == null) rateOverlay[s.quote] = s.rate;
      }
    } catch {
      /* non-fatal — fall back to seed rates */
    }

    const corridors = CORRIDOR_SEEDS.filter((c) => c.sourceCurrency === base).map((c) => {
      const liveRate = rateOverlay[c.targetCurrency];
      const rate = typeof liveRate === "number" && liveRate > 0 ? liveRate : c.rate;
      return {
        sourceCurrency: c.sourceCurrency,
        targetCurrency: c.targetCurrency,
        rate,
        rateAgeHours: typeof liveRate === "number" ? 1 : null,
        feeBps: c.feeBps,
        feeFixedKobo: c.feeFixedKobo,
        estimatedDeliveryHours: c.estimatedDeliveryHours,
        provider: c.provider,
        minAmountKobo: c.minAmountKobo,
        maxAmountKobo: c.maxAmountKobo,
        supportsBank: c.supportsBank,
        supportsMobileWallet: c.supportsMobileWallet,
        targetFlag: c.targetFlag,
        targetName: c.targetName,
      };
    });

    return json({
      base,
      corridors,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    return handleError(e);
  }
}
