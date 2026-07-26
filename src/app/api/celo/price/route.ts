import { db } from "@/lib/db";
import { json, handleError } from "@/lib/api";

const FALLBACK_USD_NGN = 1480;

// GET /api/celo/price?token=USDm
// Returns the current USD/NGN rate from FxRateSnapshot (with fallback).
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const token = (url.searchParams.get("token") ?? "USDm").toUpperCase();

    const recent = await db.fxRateSnapshot.findFirst({
      where: { base: "USD", quote: "NGN", expiresAt: { gt: new Date() } },
      orderBy: { fetchedAt: "desc" },
    });

    if (recent) {
      return json({
        token,
        usdNgnRate: recent.rate,
        source: recent.source,
        fetchedAt: recent.fetchedAt,
        expiresAt: recent.expiresAt,
      });
    }

    // Try the inverse (NGN -> USD)
    const inverse = await db.fxRateSnapshot.findFirst({
      where: { base: "NGN", quote: "USD" },
      orderBy: { fetchedAt: "desc" },
    });
    if (inverse && inverse.rate > 0) {
      return json({
        token,
        usdNgnRate: 1 / inverse.rate,
        source: inverse.source + "(inverted)",
        fetchedAt: inverse.fetchedAt,
      });
    }

    return json({
      token,
      usdNgnRate: FALLBACK_USD_NGN,
      source: "fallback",
      fetchedAt: new Date(),
    });
  } catch (e) {
    return handleError(e);
  }
}
