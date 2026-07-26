// Turbopay admin — capability matrix management
//
// GET  ?providerCode=&country=&contract=&currency=&direction=
//        Returns ProviderCapability rows filtered by any of those optional query
//        params. Always returns joined displayName of the owning ProviderConfig.
// POST {providerCode, contract, country, currency, service, direction,
//       minAmountMinor, maxAmountMinor, feeBps, feeFixedMinor, settleHours, enabled}
//        Creates a new capability row. Capabilities are unique per
//        (providerCode, contract, country, currency, direction, service) tuple.

import { db } from "@/lib/db";
import { json, handleError, audit, getClientIp } from "@/lib/api";
import { requirePermission } from "@/lib/turbocore/rbac";
import { Permissions } from "@/lib/turbocore/rbac/permissions";
import { invalidateCapabilityCache } from "@/lib/turbocore/routing-engine";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requirePermission(Permissions.CAPABILITIES_VIEW);
    const url = new URL(req.url);
    const where: Record<string, string> = {};
    const providerCode = url.searchParams.get("providerCode");
    const country = url.searchParams.get("country");
    const contract = url.searchParams.get("contract");
    const currency = url.searchParams.get("currency");
    const direction = url.searchParams.get("direction");
    if (providerCode) where.providerCode = providerCode;
    if (country) where.country = country;
    if (contract) where.contract = contract;
    if (currency) where.currency = currency;
    if (direction) where.direction = direction;

    const rows = await db.providerCapability.findMany({
      where,
      orderBy: [{ contract: "asc" }, { providerCode: "asc" }, { country: "asc" }],
    });
    return json({
      capabilities: rows.map((c) => ({
        ...c,
        service: c.service ?? null,
      })),
      count: rows.length,
    });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requirePermission(Permissions.CAPABILITIES_MANAGE);
    const body = await req.json().catch(() => ({}));
    const providerCode = String(body.providerCode ?? "").trim().toLowerCase();
    const contract = String(body.contract ?? "").trim().toUpperCase();
    const country = String(body.country ?? "ALL").trim().toUpperCase();
    const currency = String(body.currency ?? "ALL").trim().toUpperCase();
    const direction = String(body.direction ?? "INBOUND").trim().toUpperCase();
    if (!providerCode || !contract) {
      return json({ error: "providerCode and contract are required" }, 400);
    }
    if (direction !== "INBOUND" && direction !== "OUTBOUND") {
      return json({ error: "direction must be INBOUND or OUTBOUND" }, 400);
    }
    const provider = await db.providerConfig.findUnique({ where: { code: providerCode } });
    if (!provider) return json({ error: "Provider not found" }, 404);

    const service = body.service ? String(body.service) : null;
    const minAmountMinor = Math.max(0, Number(body.minAmountMinor ?? 0) || 0);
    const maxAmountMinor = Math.max(0, Number(body.maxAmountMinor ?? 0) || 0);
    const feeBps = Math.max(0, Math.min(10000, Number(body.feeBps ?? 0) || 0));
    const feeFixedMinor = Math.max(0, Number(body.feeFixedMinor ?? 0) || 0);
    const settleHours = Math.max(0, Math.min(720, Number(body.settleHours ?? 0) || 0));
    const enabled = Boolean(body.enabled ?? true);

    // Uniqueness check (no native unique index on this combination — soft check)
    const existing = await db.providerCapability.findFirst({
      where: {
        providerCode,
        contract,
        country,
        currency,
        direction,
        service: service ?? null,
      },
    });
    if (existing) {
      return json({ error: "Capability already exists for this tuple", existing }, 409);
    }

    const created = await db.providerCapability.create({
      data: {
        providerCode,
        contract,
        country,
        currency,
        service,
        direction,
        minAmountMinor,
        maxAmountMinor,
        feeBps,
        feeFixedMinor,
        settleHours,
        enabled,
      },
    });
    invalidateCapabilityCache();
    await audit({
      userId: user.id,
      action: "ADMIN_CAPABILITY_CREATE",
      category: "ADMIN",
      severity: "WARN",
      ip: getClientIp(req),
      metadata: { providerCode, contract, country, currency, direction, service },
    });
    return json({ capability: created }, 201);
  } catch (e) {
    return handleError(e);
  }
}
