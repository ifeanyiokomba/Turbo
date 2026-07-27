// TurboCore GCR — capability resolution engine endpoint
//
// GET /api/admin/gcr/resolve?country=NG&capability=collections.cards&currency=NGN&direction=INBOUND&kycTier=1
//   Returns the resolution result: candidates, failover chain, dependencies checked.
//
// GET /api/admin/gcr/resolve?country=NG&explain=1
//   Returns an explanation of why the capability is (or isn't) available.
//
// POST /api/admin/gcr/resolve
//   Body: ResolutionRequest — same as GET but supports merchantId.

import { json, handleError } from "@/lib/api";
import { requirePermission } from "@/lib/turbocore/rbac";
import { Permissions } from "@/lib/turbocore/rbac/permissions";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { resolveCapability, explainResolution, resolveAllForCountry } =
      await import("@/lib/turbocore/gcr");
    await requirePermission(Permissions.CAPABILITIES_VIEW);
    const url = new URL(req.url);
    const country = url.searchParams.get("country") ?? "NG";
    const capability = url.searchParams.get("capability");
    const explain = url.searchParams.get("explain") === "1";
    const all = url.searchParams.get("all") === "1";

    if (all) {
      const kycTier = Number(url.searchParams.get("kycTier") ?? "1");
      const currency = url.searchParams.get("currency") ?? undefined;
      const results = await resolveAllForCountry(country, { kycTier, currency });
      return json({ country, results });
    }

    if (!capability) {
      return json({ error: "Missing 'capability' parameter (or use ?all=1)" }, 400);
    }

    const request = {
      country,
      capabilityId: capability,
      currency: url.searchParams.get("currency") ?? undefined,
      amountMinor: url.searchParams.get("amountMinor")
        ? Number(url.searchParams.get("amountMinor"))
        : undefined,
      direction: (url.searchParams.get("direction") as any) ?? undefined,
      kycTier: url.searchParams.get("kycTier")
        ? (Number(url.searchParams.get("kycTier")) as any)
        : undefined,
    };

    if (explain) {
      const result = await explainResolution(request);
      return json(result);
    }

    const result = await resolveCapability(request);
    return json(result);
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const { resolveCapability, explainResolution, resolveAllForCountry } =
      await import("@/lib/turbocore/gcr");
    await requirePermission(Permissions.CAPABILITIES_VIEW);
    const body = await req.json().catch(() => ({}));
    const result = await resolveCapability({
      country: body.country ?? "NG",
      capabilityId: body.capabilityId,
      currency: body.currency,
      amountMinor: body.amountMinor,
      direction: body.direction,
      kycTier: body.kycTier,
      merchantId: body.merchantId,
      environment: body.environment,
    });
    return json(result);
  } catch (e) {
    return handleError(e);
  }
}
