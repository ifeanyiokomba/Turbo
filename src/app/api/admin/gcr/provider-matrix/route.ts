// TurboCore GCR — provider capability matrix
//
// GET /api/admin/gcr/provider-matrix
//   ?provider=paystack
//   ?capability=collections.cards
//   Returns the provider × capability matrix.

import { json, handleError } from "@/lib/api";
import { requirePermission } from "@/lib/turbocore/rbac";
import { Permissions } from "@/lib/turbocore/rbac/permissions";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const {
      getProviderMatrix,
      getProviderCapabilities,
      getCapabilityProviders,
      getMappedProviders,
    } = await import("@/lib/turbocore/gcr");
    await requirePermission(Permissions.CAPABILITIES_VIEW);
    const url = new URL(req.url);
    const provider = url.searchParams.get("provider");
    const capability = url.searchParams.get("capability");

    if (provider) {
      const entries = getProviderCapabilities(provider);
      return json({ provider, entries, count: entries.length });
    }

    if (capability) {
      const entries = getCapabilityProviders(capability);
      return json({ capability, entries, count: entries.length });
    }

    // Full matrix — grouped by provider
    const matrix = getProviderMatrix();
    const providers = getMappedProviders();
    const byProvider = providers.map((code) => ({
      providerCode: code,
      entries: matrix.filter((e) => e.providerCode === code),
      totalCapabilities: matrix.filter((e) => e.providerCode === code).length,
      byMaturity: matrix
        .filter((e) => e.providerCode === code)
        .reduce(
          (acc, e) => {
            acc[e.maturity] = (acc[e.maturity] ?? 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        ),
    }));

    return json({
      providers: byProvider,
      totalProviders: providers.length,
      totalEntries: matrix.length,
    });
  } catch (e) {
    return handleError(e);
  }
}
