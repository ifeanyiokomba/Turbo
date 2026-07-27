// TurboCore GCR — capabilities endpoint
//
// GET /api/admin/gcr/capabilities
//   ?groupId=collections&status=STABLE&country=NG&q=card
//   Returns filtered capabilities with full metadata.
//
// GET /api/admin/gcr/capabilities?id=collections.cards
//   Returns full capability detail: metadata + dependencies + providers +
//   certification + country support matrix + prerequisite tree.

import { json, handleError } from "@/lib/api";
import { requirePermission } from "@/lib/turbocore/rbac";
import { Permissions } from "@/lib/turbocore/rbac/permissions";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requirePermission(Permissions.CAPABILITIES_VIEW);
    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    // Single-capability detail mode
    if (id) {
      const {
        getCapability,
        getDirectDependencies,
        getDependents,
        areHardDependenciesSatisfied,
        getPrerequisiteTree,
        getCapabilityProviders,
        listSupportedCountries,
        getCountryCapabilitySupport,
        getCapabilityTests,
        getCertification,
      } = await import("@/lib/turbocore/gcr");

      const cap = getCapability(id);
      if (!cap) return json({ error: "Capability not found" }, 404);

      const dependencies = getDirectDependencies(id);
      const dependents = getDependents(id);
      const hardCheck = areHardDependenciesSatisfied(id);
      const prereqTree = getPrerequisiteTree(id);
      const providers = getCapabilityProviders(id);
      const tests = getCapabilityTests(id);
      const countrySupport = listSupportedCountries().map((code) => ({
        country: code,
        support: getCountryCapabilitySupport(code, id),
      }));
      const certifications = providers.map((p) => ({
        providerCode: p.providerCode,
        maturity: p.maturity,
        certification: getCertification(p.providerCode, id),
      }));

      return json({
        capability: cap,
        dependencies,
        dependents,
        hardDependencies: hardCheck,
        prerequisiteTree: prereqTree,
        providers,
        certifications,
        countrySupport,
        tests,
      });
    }

    // List mode
    const { CAPABILITIES } = await import("@/lib/turbocore/gcr");
    const groupId = url.searchParams.get("groupId");
    const status = url.searchParams.get("status");
    const country = url.searchParams.get("country");
    const q = url.searchParams.get("q")?.toLowerCase().trim();

    let result = CAPABILITIES;
    if (groupId) result = result.filter((c) => c.groupId === groupId);
    if (status) result = result.filter((c) => c.status === status);
    if (country)
      result = result.filter(
        (c) => c.countries.includes("ALL") || c.countries.includes(country.toUpperCase())
      );
    if (q) {
      result = result.filter(
        (c) =>
          c.id.toLowerCase().includes(q) ||
          c.name.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    return json({
      capabilities: result,
      count: result.length,
    });
  } catch (e) {
    return handleError(e);
  }
}
