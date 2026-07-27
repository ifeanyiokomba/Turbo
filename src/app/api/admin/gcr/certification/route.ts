// TurboCore GCR — certification matrix endpoint
//
// GET /api/admin/gcr/certification
//   ?provider=paystack&capability=collections.cards&status=CERTIFIED
//   Returns the provider × capability certification matrix.
//
// POST /api/admin/gcr/certification
//   { provider, capability }
//   Runs (simulated) certification for a provider × capability pair.

import { json, handleError, audit, getClientIp } from "@/lib/api";
import { requirePermission } from "@/lib/turbocore/rbac";
import { Permissions } from "@/lib/turbocore/rbac/permissions";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { listCertifications, getCertificationStats, getCertificationMatrix } =
      await import("@/lib/turbocore/gcr");
    await requirePermission(Permissions.CAPABILITIES_VIEW);
    const url = new URL(req.url);
    const provider = url.searchParams.get("provider") ?? undefined;
    const capability = url.searchParams.get("capability") ?? undefined;
    const status = url.searchParams.get("status") ?? undefined;

    const certs = listCertifications({
      providerCode: provider,
      capabilityId: capability,
      status: status as any,
    });
    const stats = getCertificationStats();
    const matrix = getCertificationMatrix();
    return json({ certs, count: certs.length, stats, matrix });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const { runCapabilityCertification } = await import("@/lib/turbocore/gcr");
    const user = await requirePermission(Permissions.CAPABILITIES_MANAGE);
    const body = await req.json().catch(() => ({}));
    if (!body.provider || !body.capability) {
      return json({ error: "provider and capability are required" }, 400);
    }
    const cert = await runCapabilityCertification(String(body.provider), String(body.capability));
    await audit({
      userId: user.id,
      action: "GCR_CERTIFICATION_RUN",
      category: "CAPABILITIES",
      ip: getClientIp(req),
      metadata: { provider: body.provider, capability: body.capability, status: cert.status },
    });
    return json({ cert });
  } catch (e) {
    return handleError(e);
  }
}
