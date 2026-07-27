// Geo-routing endpoint — single source of truth for "for country X, which
// providers are preferred for each operation".
//
// GET ?country=NG
//   Returns the full CountryConfig + a `preferredByContract` map that lists,
//   for every ContractName, the ordered array of preferred provider codes.
//   This is the API the frontend calls to render country-aware provider
//   pickers (e.g. "Send money to Nigeria → prefer Paystack/Flutterwave")
//   without having to hard-code the matrix on the client.
//
// The data comes straight from CountryConfig.providersPreferred (the
// consolidated source in src/lib/turbocore/geo/country-config.ts) so there is
// exactly one place to update when the preferred-provider matrix changes.

import { json, handleError, requireUser } from "@/lib/api";
import { getCountryConfig, getAllCountryConfigs } from "@/lib/turbocore/geo/country-config";
import { ALL_CONTRACTS, type ContractName } from "@/lib/turbocore/result";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireUser();
    const url = new URL(req.url);
    const countryParam = (url.searchParams.get("country") ?? "").toUpperCase();

    // Single-country mode — return that one country's config + preferred map.
    if (countryParam) {
      const config = await getCountryConfig(countryParam);
      return json({
        country: config.code,
        name: config.name,
        currency: config.currency,
        dialCode: config.dialCode,
        flagEmoji: config.flagEmoji,
        locale: config.locale,
        rtl: config.rtl,
        paymentMethods: config.paymentMethods,
        billerCatalogKey: config.billerCatalogKey ?? null,
        kycRequirements: config.kycRequirements,
        taxRateBps: config.taxRateBps,
        regulatoryNotes: config.regulatoryNotes ?? null,
        enabled: config.enabled,
        preferredByContract: buildPreferredByContract(config.providersPreferred),
      });
    }

    // No country filter — return every enabled country's preferred map.
    const all = await getAllCountryConfigs();
    return json({
      countries: all.map((c) => ({
        country: c.code,
        name: c.name,
        currency: c.currency,
        flagEmoji: c.flagEmoji,
        paymentMethods: c.paymentMethods,
        preferredByContract: buildPreferredByContract(c.providersPreferred),
      })),
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    return handleError(e);
  }
}

// Normalise the providersPreferred map so every ContractName key is present
// (empty array when the country has no preference for that contract). This
// makes the response shape stable for the frontend.
function buildPreferredByContract(
  preferred: Record<string, string[]>
): Record<ContractName, string[]> {
  const out = {} as Record<ContractName, string[]>;
  for (const c of ALL_CONTRACTS) {
    out[c] = (preferred[c] as string[] | undefined) ?? [];
  }
  return out;
}
