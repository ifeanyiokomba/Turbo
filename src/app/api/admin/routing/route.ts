// Turbopay admin — provider routing rules
//
// GET  : list all ProviderRoute rows.
// POST {contract, providerCode, country, currency, priority, weight, canaryPercent, enabled}
//        Creates a new route row. Routes are used by the routing engine to pick
//        the best provider for a given (contract, country, currency) tuple.

import { db } from "@/lib/db";
import { json, handleError, requireAdmin, audit, getClientIp } from "@/lib/api";
import { invalidateCapabilityCache } from "@/lib/turbocore/routing-engine";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const where: Record<string, string> = {};
    const contract = url.searchParams.get("contract");
    const providerCode = url.searchParams.get("providerCode");
    const country = url.searchParams.get("country");
    if (contract) where.contract = contract;
    if (providerCode) where.providerCode = providerCode;
    if (country) where.country = country;
    const rows = await db.providerRoute.findMany({
      where,
      orderBy: [{ contract: "asc" }, { priority: "desc" }, { country: "asc" }],
    });
    return json({ routes: rows, count: rows.length });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAdmin();
    const body = await req.json().catch(() => ({}));
    const contract = String(body.contract ?? "").trim().toUpperCase();
    const providerCode = String(body.providerCode ?? "").trim().toLowerCase();
    const country = String(body.country ?? "ALL").trim().toUpperCase();
    const currency = String(body.currency ?? "ALL").trim().toUpperCase();
    if (!contract || !providerCode) {
      return json({ error: "contract and providerCode are required" }, 400);
    }
    const provider = await db.providerConfig.findUnique({ where: { code: providerCode } });
    if (!provider) return json({ error: "Provider not found" }, 404);

    const priority = Math.max(0, Math.min(100, Number(body.priority ?? 50) || 50));
    const weight = Math.max(0, Math.min(100, Number(body.weight ?? 100) || 100));
    const canaryPercent = Math.max(0, Math.min(100, Number(body.canaryPercent ?? 100) || 100));
    const enabled = Boolean(body.enabled ?? true);

    const created = await db.providerRoute.create({
      data: {
        contract,
        providerCode,
        country,
        currency,
        priority,
        weight,
        canaryPercent,
        enabled,
      },
    });
    invalidateCapabilityCache();
    await audit({
      userId: user.id,
      action: "ADMIN_ROUTE_CREATE",
      category: "ADMIN",
      severity: "WARN",
      ip: getClientIp(req),
      metadata: { contract, providerCode, country, currency, priority, weight, canaryPercent },
    });
    return json({ route: created }, 201);
  } catch (e) {
    return handleError(e);
  }
}
