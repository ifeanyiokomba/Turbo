// TurboCore GCR — country capability matrix
//
// GET /api/admin/gcr/country-matrix
//   Returns all country profiles with their capability support levels.
//
// GET /api/admin/gcr/country-matrix?country=NG
//   Returns a single country profile.
//
// GET /api/admin/gcr/country-matrix?capability=collections.cards
//   Returns the support level for one capability across all countries.

import { json, handleError } from "@/lib/api";
import { requirePermission } from "@/lib/turbocore/rbac";
import { Permissions } from "@/lib/turbocore/rbac/permissions";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const {
      getAllCountryProfiles,
      getCountryProfile,
      listSupportedCountries,
      getCountryCapabilitySupport,
      CAPABILITIES,
    } = await import("@/lib/turbocore/gcr");
    await requirePermission(Permissions.CAPABILITIES_VIEW);
    const url = new URL(req.url);
    const country = url.searchParams.get("country");
    const capability = url.searchParams.get("capability");

    if (country) {
      const profile = getCountryProfile(country);
      return json({ profile });
    }

    if (capability) {
      const support = listSupportedCountries().map((c) => ({
        country: c,
        support: getCountryCapabilitySupport(c, capability),
      }));
      return json({ capability, support });
    }

    // Full matrix
    const profiles = getAllCountryProfiles();
    const matrix = profiles.map((p) => ({
      country: p.country,
      name: p.name,
      flagEmoji: p.flagEmoji,
      currency: p.currency,
      kycRequirements: p.kycRequirements,
      regulatoryNotes: p.regulatoryNotes,
      capabilities: p.capabilities,
      // Counts
      full: Object.values(p.capabilities).filter((s) => s === "FULL").length,
      limited: Object.values(p.capabilities).filter((s) => s === "LIMITED").length,
      beta: Object.values(p.capabilities).filter((s) => s === "BETA").length,
      configurable: Object.values(p.capabilities).filter((s) => s === "CONFIGURABLE").length,
      disabled: Object.values(p.capabilities).filter((s) => s === "DISABLED").length,
    }));
    return json({
      countries: matrix,
      totalCapabilities: CAPABILITIES.length,
    });
  } catch (e) {
    return handleError(e);
  }
}
