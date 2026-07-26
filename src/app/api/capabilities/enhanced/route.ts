// Enhanced capability matrix — richer than /api/capabilities. For each contract in
// the requested country/currency, returns the full scored provider pool with:
//   - score, successRate, avgLatencyMs, health, circuit state, preferred flag
//   - fee (bps + fixed) + settleHours
//   - failover chain (primary + alternatives in order)
//
// Used by the admin dashboard + capabilities explorer to show operators exactly
// which providers will be picked, in what order, for any (country, currency, contract).

import { json, handleError, requireUser } from "@/lib/api";
import { route } from "@/lib/turbocore/routing-engine";
import { getCountryConfig } from "@/lib/turbocore/geo/country-config";
import { ALL_CONTRACTS, type ContractName } from "@/lib/turbocore/result";

export const dynamic = "force-dynamic";

const ENHANCED_CONTRACTS: ContractName[] = ALL_CONTRACTS.filter(
  (c): c is ContractName => c !== "NOTIFICATION",
);

export async function GET(req: Request) {
  try {
    await requireUser();
    const url = new URL(req.url);
    const country = (url.searchParams.get("country") ?? "NG").toUpperCase();
    const currencyParam = (url.searchParams.get("currency") ?? "").toUpperCase();
    const contractFilter = (url.searchParams.get("contract") ?? "").toUpperCase();
    const amountMinor = Math.max(1_000, Number(url.searchParams.get("amountMinor") ?? 100_000) || 100_000);
    const direction = (url.searchParams.get("direction") ?? "INBOUND").toUpperCase() === "OUTBOUND" ? "OUTBOUND" : "INBOUND";

    const countryConfig = await getCountryConfig(country);
    const currency = currencyParam || countryConfig.currency;
    const preferredForCountry = countryConfig.providersPreferred ?? {};

    const contracts = contractFilter
      ? ENHANCED_CONTRACTS.filter((c) => c === contractFilter)
      : ENHANCED_CONTRACTS;

    const perContract = await Promise.all(
      contracts.map(async (contract) => {
        // Try the requested direction first; if no providers viable, try the opposite.
        let decision = await route({
          contract,
          country,
          currency,
          amountMinor,
          direction,
        }).catch(() => null);

        if (!decision || decision.reason === "none") {
          const opposite = direction === "INBOUND" ? "OUTBOUND" : "INBOUND";
          decision = await route({
            contract,
            country,
            currency,
            amountMinor,
            direction: opposite,
          }).catch(() => null);
        }

        if (!decision || decision.reason === "none" || decision.scores.length === 0) {
          return {
            contract,
            available: false,
            reason: "none",
            primaryProvider: null,
            failoverChain: [],
            providers: [],
            geo: { country, currency },
          };
        }

        const preferredForContract = preferredForCountry[contract] ?? [];
        const sortedScores = [...decision.scores].sort((a, b) => b.score - a.score);

        // Build the failover chain: primary + alternatives (up to 3 total).
        const failoverChain = [decision.providerCode, ...decision.alternatives].slice(0, 3);

        return {
          contract,
          available: true,
          reason: decision.reason,
          primaryProvider: decision.providerCode,
          failoverChain,
          geo: decision.geoAware,
          preferredInCountry: preferredForContract,
          providers: sortedScores.map((s) => ({
            providerCode: s.providerCode,
            score: s.score,
            successRate: s.successRate,
            avgLatencyMs: s.avgLatencyMs,
            health: s.health,
            circuit: s.circuit,
            preferred: s.preferred || preferredForContract.includes(s.providerCode),
            fee: {
              bps: s.feeBps,
              fixedMinor: s.feeFixedMinor,
            },
            settleHours: s.settleHours,
            inFailoverChain: failoverChain.includes(s.providerCode),
          })),
        };
      }),
    );

    return json({
      country,
      currency,
      direction,
      amountMinor,
      countryName: countryConfig.name,
      flagEmoji: countryConfig.flagEmoji,
      contracts: perContract,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    return handleError(e);
  }
}
