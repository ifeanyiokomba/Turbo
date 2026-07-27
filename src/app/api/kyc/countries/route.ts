import { json, requireUser } from "@/lib/api";
import { listSupportedCountries } from "@/lib/turbocore/kyc-engine";

// GET — list all supported countries with their KYC requirements
export async function GET() {
  try {
    await requireUser();
    const countries = listSupportedCountries().map((c) => ({
      code: c.code,
      name: c.name,
      currency: c.currency,
      flagEmoji: c.flagEmoji,
      tier2: {
        label: c.tiers.tier2.label,
        idTypes: c.tiers.tier2.idTypes.map((t) => ({
          type: t.type,
          label: t.label,
          description: t.description,
          fields: t.fields,
        })),
        limits: {
          singleTx: c.tiers.tier2.singleTxLimitKobo,
          daily: c.tiers.tier2.dailyLimitKobo,
          maxBalance: c.tiers.tier2.maxBalanceKobo,
        },
      },
      tier3: {
        label: c.tiers.tier3.label,
        idTypes: c.tiers.tier3.idTypes.map((t) => ({
          type: t.type,
          label: t.label,
          description: t.description,
          fields: t.fields,
        })),
        limits: {
          singleTx: c.tiers.tier3.singleTxLimitKobo,
          daily: c.tiers.tier3.dailyLimitKobo,
          maxBalance: c.tiers.tier3.maxBalanceKobo,
        },
      },
    }));
    return json({ countries });
  } catch {
    return json({ error: "Unauthorized" }, 401);
  }
}
