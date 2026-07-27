import { json, handleError, requireUser } from "@/lib/api";
import { getRate } from "@/lib/turbocore/fx/convert";

const KEY_PAIRS: Array<{ base: string; quote: string; label: string }> = [
  { base: "NGN", quote: "USD", label: "NGN → USD" },
  { base: "USD", quote: "NGN", label: "USD → NGN" },
  { base: "NGN", quote: "KES", label: "NGN → KES" },
  { base: "KES", quote: "NGN", label: "KES → NGN" },
  { base: "NGN", quote: "GHS", label: "NGN → GHS" },
  { base: "GHS", quote: "NGN", label: "GHS → NGN" },
  { base: "NGN", quote: "ZAR", label: "NGN → ZAR" },
  { base: "USD", quote: "KES", label: "USD → KES" },
  { base: "USD", quote: "GHS", label: "USD → GHS" },
  { base: "USD", quote: "GBP", label: "USD → GBP" },
  { base: "GBP", quote: "USD", label: "GBP → USD" },
  { base: "USD", quote: "EUR", label: "USD → EUR" },
];

export async function GET() {
  try {
    await requireUser();

    const rates = await Promise.all(
      KEY_PAIRS.map(async (p) => {
        try {
          const r = await getRate(p.base, p.quote);
          return {
            base: p.base,
            quote: p.quote,
            label: p.label,
            rate: r.rate,
            source: r.source,
            fetchedAt: r.fetchedAt,
            expiresAt: r.expiresAt,
          };
        } catch {
          return {
            base: p.base,
            quote: p.quote,
            label: p.label,
            rate: 0,
            source: "unavailable",
            fetchedAt: new Date(),
            expiresAt: new Date(),
          };
        }
      })
    );

    return json({ rates, generatedAt: new Date().toISOString() });
  } catch (e) {
    return handleError(e);
  }
}
