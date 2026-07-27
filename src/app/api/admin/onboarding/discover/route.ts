// TurboCore — Provider Onboarding: Discover Capabilities
//
// Step 2 of the plug-and-play onboarding flow.
// After verification, this endpoint fetches the full capability discovery
// from the provider's manifest and maps them to GCR capabilities.
//
// POST /api/admin/onboarding/discover
//   { providerCode, adapterType }
// → Returns: mapped capabilities (GCR ids), unmapped capabilities,
//   country support matrix, recommended services.

import { json, handleError, audit, getClientIp } from "@/lib/api";
import { requirePermission } from "@/lib/turbocore/rbac";
import { Permissions } from "@/lib/turbocore/rbac/permissions";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requirePermission(Permissions.PROVIDERS_MANAGE);
    const body = await req.json().catch(() => ({}));

    const providerCode = String(body.providerCode ?? "")
      .toLowerCase()
      .trim();
    const adapterType = String(body.adapterType ?? "").trim();

    if (!providerCode || !adapterType) {
      return json({ error: "providerCode and adapterType are required" }, 400);
    }

    const { getAllManifests } = await import("@/lib/turbocore/manifest-registry");
    const { getProviderMatrix } = await import("@/lib/turbocore/gcr/provider-matrix");
    const { getCapability } = await import("@/lib/turbocore/gcr/capability-tree");

    const manifest = getAllManifests().find((m) => m.provider === adapterType);
    if (!manifest) {
      return json({ error: `Unknown adapter: ${adapterType}` }, 400);
    }

    // Get the provider's mapped capabilities from the GCR provider-matrix
    const fullMatrix = getProviderMatrix();
    const providerEntries = fullMatrix.filter((e) => e.providerCode === manifest.provider);

    // Separate into mapped (have a GCR capability) and unmapped
    const mapped: Array<{
      capabilityId: string;
      capabilityName: string;
      direction: string;
      maturity: string;
      countries: string[];
    }> = [];
    const unmapped: Array<{ manifestCapability: string; direction: string }> = [];

    for (const entry of providerEntries) {
      const cap = getCapability(entry.capabilityId);
      if (cap) {
        mapped.push({
          capabilityId: entry.capabilityId,
          capabilityName: cap.name,
          direction: cap.direction,
          maturity: entry.maturity,
          countries: entry.countries,
        });
      }
    }

    // Check for unmapped manifest capabilities
    for (const mCap of manifest.capabilities) {
      const hasMapping = providerEntries.some((e) =>
        e.capabilityId.includes(mCap.name.toLowerCase().replace(/_/g, "."))
      );
      if (!hasMapping && mapped.length === 0) {
        unmapped.push({ manifestCapability: mCap.name, direction: mCap.direction });
      }
    }

    // Country support matrix
    const countrySupport = manifest.countries.map((country) => {
      const capabilities = manifest.capabilities.filter(
        (c) => c.countries.includes(country) || c.countries.length === 0
      );
      return {
        country,
        capabilities: capabilities.map((c) => c.name),
        count: capabilities.length,
      };
    });

    // Recommended services (capabilities that are STABLE and have multiple providers)
    const recommended = mapped.filter((m) => {
      const cap = getCapability(m.capabilityId);
      return cap?.status === "STABLE";
    });

    await audit({
      userId: user.id,
      action: "PROVIDER_ONBOARDING_DISCOVER",
      category: "PROVIDERS",
      ip: getClientIp(req),
      metadata: {
        providerCode,
        adapterType,
        mappedCount: mapped.length,
        unmappedCount: unmapped.length,
        countryCount: countrySupport.length,
      },
    });

    return json({
      providerCode,
      adapterType,
      displayName: manifest.displayName,
      mapped,
      unmapped,
      countrySupport,
      recommended,
      summary: {
        totalCapabilities: mapped.length,
        totalCountries: countrySupport.length,
        totalCurrencies: manifest.currencies.length,
        webhookSupported: manifest.webhookSupported,
        settlementCycle: manifest.settlementCycle,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
