// TurboCore GCR — capability flags endpoint
//
// GET /api/admin/gcr/flags
//   ?capabilityId=collections.stablecoins&scope=COUNTRY
//   Returns the flag list with optional filters.
//
// POST /api/admin/gcr/flags
//   { capabilityId, scope, target, enabled, reason }
//   Creates or updates a flag override.
//
// DELETE /api/admin/gcr/flags?capabilityId=X&scope=Y&target=Z
//   Deletes a flag override.

import { json, handleError, audit, getClientIp } from "@/lib/api";
import { requirePermission } from "@/lib/turbocore/rbac";
import { Permissions } from "@/lib/turbocore/rbac/permissions";
import type { CapabilityFlagScope } from "@/lib/turbocore/gcr";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { listFlags, getFlagStats } = await import("@/lib/turbocore/gcr");
    await requirePermission(Permissions.CAPABILITIES_VIEW);
    const url = new URL(req.url);
    const capabilityId = url.searchParams.get("capabilityId") ?? undefined;
    const scope = (url.searchParams.get("scope") as CapabilityFlagScope | null) ?? undefined;
    const target = url.searchParams.get("target") ?? undefined;
    const flags = listFlags({ capabilityId, scope, target });
    const stats = getFlagStats();
    return json({ flags, count: flags.length, stats });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const { setFlag } = await import("@/lib/turbocore/gcr");
    const user = await requirePermission(Permissions.CAPABILITIES_MANAGE);
    const body = await req.json().catch(() => ({}));
    if (!body.capabilityId || !body.scope || !body.target) {
      return json({ error: "capabilityId, scope, and target are required" }, 400);
    }
    const flag = setFlag({
      capabilityId: String(body.capabilityId),
      scope: String(body.scope) as CapabilityFlagScope,
      target: String(body.target),
      enabled: Boolean(body.enabled),
      reason: body.reason ? String(body.reason) : undefined,
      updatedBy: user.id,
    });
    await audit({
      userId: user.id,
      action: "GCR_FLAG_SET",
      category: "CAPABILITIES",
      ip: getClientIp(req),
      metadata: { flag },
    });
    return json({ flag });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const { deleteFlag } = await import("@/lib/turbocore/gcr");
    const user = await requirePermission(Permissions.CAPABILITIES_MANAGE);
    const url = new URL(req.url);
    const capabilityId = url.searchParams.get("capabilityId");
    const scope = url.searchParams.get("scope") as CapabilityFlagScope | null;
    const target = url.searchParams.get("target");
    if (!capabilityId || !scope || !target) {
      return json({ error: "capabilityId, scope, and target query params are required" }, 400);
    }
    const deleted = deleteFlag(capabilityId, scope, target);
    await audit({
      userId: user.id,
      action: "GCR_FLAG_DELETE",
      category: "CAPABILITIES",
      ip: getClientIp(req),
      metadata: { capabilityId, scope, target, deleted },
    });
    return json({ deleted, capabilityId, scope, target });
  } catch (e) {
    return handleError(e);
  }
}
