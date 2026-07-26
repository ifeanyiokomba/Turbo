// Admin — quick toggle for a feature flag.
//
// POST { key, enabled }
//   - key: any string (will be lowercased + sanitised to A-Z0-9_). Most
//     useful for the parked TurboCore flags (stripe_enabled, wise_enabled,
//     international_transfers_enabled, virtual_cards_stripe_enabled) but
//     accepts any BOOL flag in the FeatureFlag table.
//   - enabled: boolean — the new effective value.
//
// Side effects:
//   - Upserts the FeatureFlag row so toggling works even before the seed
//     has run (create-on-first-toggle).
//   - Invalidates the in-memory flag cache so the routing engine picks up
//     the new value on the very next route() call.
//   - Audits as ADMIN_FEATURE_FLAG_TOGGLE with WARN severity.
//
// Returns { key, enabled }.

import { db } from "@/lib/db";
import { json, handleError, requireAdmin, audit, getClientIp, ServiceError } from "@/lib/api";
import { invalidateFlagCache, FLAG_DEFAULTS } from "@/lib/turbocore/feature-flags";

export const dynamic = "force-dynamic";

interface ToggleBody {
  key?: string;
  enabled?: boolean;
}

export async function POST(req: Request) {
  try {
    const user = await requireAdmin();
    const body = (await req.json().catch(() => ({}))) as ToggleBody;

    // Sanitise + validate the key. Lower-case + underscore so it matches the
    // TurboCore flag keys exactly (stripe_enabled, wise_enabled, …).
    const key = String(body.key ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_");
    if (!key) throw new ServiceError("key is required", 400, "MISSING_KEY");
    if (typeof body.enabled !== "boolean")
      throw new ServiceError("enabled (boolean) is required", 400, "MISSING_ENABLED");

    const valueJSON = JSON.stringify(body.enabled);

    // Create-on-first-toggle. If the row doesn't exist yet (e.g. seed hasn't
    // run), we materialise it now with a sensible description pulled from
    // FLAG_DEFAULTS when available.
    const description =
      key in FLAG_DEFAULTS
        ? `Parked-provider flag (default ${FLAG_DEFAULTS[key] ? "ON" : "OFF"}). Toggled via /toggle endpoint.`
        : `Feature flag toggled via /toggle endpoint.`;

    const updated = await db.featureFlag.upsert({
      where: { key },
      create: {
        key,
        description,
        type: "BOOL",
        valueJSON,
        enabled: true,
        updatedBy: user.id,
      },
      update: {
        valueJSON,
        enabled: true, // ensure the row itself is alive (not a kill-switch)
        updatedBy: user.id,
      },
    });

    // Invalidate the in-memory cache so the routing engine reflects the new
    // value immediately on its next route() call.
    invalidateFlagCache(key);

    await audit({
      userId: user.id,
      action: "ADMIN_FEATURE_FLAG_TOGGLE",
      category: "ADMIN",
      severity: "WARN",
      ip: getClientIp(req),
      metadata: { key, enabled: body.enabled, rowId: updated.id },
    });

    return json({ key, enabled: body.enabled, flag: updated });
  } catch (e) {
    return handleError(e);
  }
}
